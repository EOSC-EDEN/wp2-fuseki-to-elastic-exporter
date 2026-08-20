import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { CronJob } from 'cron';
import Redis from 'ioredis';
import { SyncStateService } from '../graph-sync/sync-state.service';
import { SyncQueueProducerService } from '../sync-queue/sync-queue.producer.service';
import { FusekiService } from '../fuseki/fuseki.service';
import { GraphRegistryService } from '../graph-sync/graph-registry.service';
import { ReindexService } from '../reindex/reindex.service';
import {
  ELASTICSEARCH_CONFIG_KEY,
  REDIS_CONFIG_KEY,
  type ElasticsearchConfig,
  type RedisConfig,
} from '../config';

interface GraphChangeEvent {
  graphUri: string;
  method: string;
  timestamp: string;
}

const REDIS_CHANNEL = 'fuseki:graph-changed';

// A reconciliation error used to trigger a full reindex on every tick. At a ten
// minute interval a persistent failure meant 144 reindexes a day, each one
// creating an index.
const FULL_REINDEX_COOLDOWN_MS = 30 * 60 * 1000;

@Injectable()
export class SyncSchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SyncSchedulerService.name);
  private subscriber: Redis;
  private isReconciling = false;
  private lastFullReindexAt = 0;

  constructor(
    private readonly schedulerRegistry: SchedulerRegistry,
    private readonly configService: ConfigService,
    private readonly syncState: SyncStateService,
    private readonly syncQueueProducer: SyncQueueProducerService,
    private readonly fusekiService: FusekiService,
    private readonly graphRegistry: GraphRegistryService,
    private readonly reindexService: ReindexService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.subscribeToGraphChanges();

    const reconcileJob = new CronJob('*/10 * * * *', () => {
      void this.reconcile();
    });
    this.schedulerRegistry.addCronJob('reconciliation', reconcileJob);
    reconcileJob.start();
    this.logger.log('Registered reconciliation cron job (every 10 minutes)');
  }

  async onModuleDestroy(): Promise<void> {
    if (this.subscriber) {
      await this.subscriber.unsubscribe(REDIS_CHANNEL);
      this.subscriber.disconnect();
    }
  }

  private async subscribeToGraphChanges(): Promise<void> {
    const redisConfig =
      this.configService.getOrThrow<RedisConfig>(REDIS_CONFIG_KEY);

    this.subscriber = new Redis({
      host: redisConfig.REDIS_HOST,
      port: redisConfig.REDIS_PORT,
      ...(redisConfig.REDIS_PASSWORD && {
        password: redisConfig.REDIS_PASSWORD,
      }),
    });

    this.subscriber.on('error', (err) =>
      this.logger.error('Redis subscriber error', err),
    );

    await this.subscriber.subscribe(REDIS_CHANNEL);

    this.subscriber.on('message', (_channel: string, message: string) => {
      void this.handleGraphChangeEvent(message);
    });

    this.logger.log(`Subscribed to Redis channel "${REDIS_CHANNEL}"`);
  }

  private async handleGraphChangeEvent(message: string): Promise<void> {
    const event = JSON.parse(message) as GraphChangeEvent;
    this.logger.log(
      `Received graph change event: ${event.method} ${event.graphUri}`,
    );

    const state = await this.syncState.get();
    const indexName = this.getIndexName(state.activeIndexName);

    if (event.method === 'DELETE') {
      await this.syncQueueProducer.enqueueDeleteGraph(
        event.graphUri,
        indexName,
      );
    } else {
      await this.syncQueueProducer.enqueueSyncGraph(
        event.graphUri,
        indexName,
        null,
      );
    }
  }

  async reconcile(): Promise<void> {
    if (this.isReconciling) {
      this.logger.warn('Reconciliation already running, skipping');
      return;
    }

    this.isReconciling = true;
    try {
      const state = await this.syncState.get();
      const indexName = this.getIndexName(state.activeIndexName);

      if (!state.activeIndexName) {
        this.logger.warn(
          'No active index found, triggering full reindex for recovery',
        );
        await this.runFullReindexIfAllowed('no active index');
        return;
      }

      const allGraphUris = await this.fusekiService.listNamedGraphs();
      const fusekiGraphs = allGraphUris.filter((uri) =>
        uri.includes('/harmonized/'),
      );
      const registeredGraphs = await this.graphRegistry.findAll();

      const fusekiSet = new Set(fusekiGraphs);
      const registryMap = new Map(registeredGraphs.map((g) => [g.graphUri, g]));

      // Detect deleted graphs
      const deletedGraphs = registeredGraphs.filter(
        (g) => !fusekiSet.has(g.graphUri),
      );

      // Detect new graphs
      const newGraphs = fusekiGraphs.filter((g) => !registryMap.has(g));

      // Detect changed graphs by fingerprint. One grouped query replaces
      // fetching every graph in full on every tick.
      const fingerprints = await this.fusekiService.graphFingerprints();
      const changedGraphs: string[] = [];
      for (const graphUri of fusekiGraphs) {
        const registered = registryMap.get(graphUri);
        if (!registered) continue;

        const fingerprint = fingerprints.get(graphUri);
        if (fingerprint !== registered.contentHash) {
          changedGraphs.push(graphUri);
        }
      }

      // Enqueue sync jobs
      for (const graphUri of newGraphs) {
        await this.syncQueueProducer.enqueueSyncGraph(
          graphUri,
          indexName,
          null,
        );
      }

      for (const graphUri of changedGraphs) {
        await this.syncQueueProducer.enqueueSyncGraph(
          graphUri,
          indexName,
          null,
        );
      }

      for (const graph of deletedGraphs) {
        await this.syncQueueProducer.enqueueDeleteGraph(
          graph.graphUri,
          indexName,
        );
      }

      this.logger.log(
        `Reconciliation complete: ${newGraphs.length} new, ${changedGraphs.length} changed, ${deletedGraphs.length} deleted`,
      );
    } catch (error) {
      this.logger.error('Reconciliation failed', error);
      await this.runFullReindexIfAllowed('reconciliation failed');
    } finally {
      this.isReconciling = false;
    }
  }

  // In-memory on purpose: a process restart should be allowed one recovery
  // attempt, which is exactly when a full reindex is most likely to be correct.
  private async runFullReindexIfAllowed(reason: string): Promise<void> {
    const elapsed = Date.now() - this.lastFullReindexAt;
    if (elapsed < FULL_REINDEX_COOLDOWN_MS) {
      this.logger.warn(
        `Skipping full reindex (${reason}): last attempt was ${Math.round(elapsed / 1000)}s ago`,
      );
      return;
    }

    this.lastFullReindexAt = Date.now();
    await this.reindexService.reindexAll();
  }

  private getIndexName(activeIndexName: string | null): string {
    const esConfig = this.configService.get<ElasticsearchConfig>(
      ELASTICSEARCH_CONFIG_KEY,
    );
    return activeIndexName ?? esConfig!.ELASTICSEARCH_ALIAS;
  }
}
