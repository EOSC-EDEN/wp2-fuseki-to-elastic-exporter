import { TestBed } from '@suites/unit';
import { SchedulerRegistry } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { SyncSchedulerService } from './sync-scheduler.service';
import { SyncStateService } from '../graph-sync/sync-state.service';
import { SyncQueueProducerService } from '../sync-queue/sync-queue.producer.service';
import { FusekiService } from '../fuseki/fuseki.service';
import { GraphRegistryService } from '../graph-sync/graph-registry.service';
import { ReindexService } from '../reindex/reindex.service';
import { ELASTICSEARCH_CONFIG_KEY, REDIS_CONFIG_KEY } from '../config';

describe('SyncSchedulerService', () => {
  let service: SyncSchedulerService;
  let syncState: SyncStateService;
  let syncQueueProducer: SyncQueueProducerService;
  let fusekiService: FusekiService;
  let graphRegistry: GraphRegistryService;
  let reindexService: ReindexService;

  const esAlias = 'eden-test';

  beforeEach(async () => {
    const { unit, unitRef } = await TestBed.solitary(SyncSchedulerService)
      .mock(SchedulerRegistry)
      .impl(() => ({
        addCronJob: jest.fn(),
      }))
      .mock(ConfigService)
      .impl(() => ({
        get: jest.fn().mockImplementation((key: symbol) => {
          if (key === ELASTICSEARCH_CONFIG_KEY) {
            return { ELASTICSEARCH_ALIAS: esAlias };
          }
        }),
        getOrThrow: jest.fn().mockImplementation((key: symbol) => {
          if (key === REDIS_CONFIG_KEY) {
            return {
              REDIS_HOST: 'localhost',
              REDIS_PORT: 6379,
            };
          }
        }),
      }))
      .mock(SyncStateService)
      .impl(() => ({
        get: jest.fn(),
      }))
      .mock(SyncQueueProducerService)
      .impl(() => ({
        enqueueSyncGraph: jest.fn(),
        enqueueDeleteGraph: jest.fn(),
      }))
      .mock(FusekiService)
      .impl(() => ({
        listNamedGraphs: jest.fn(),
        fetchGraph: jest.fn(),
        graphFingerprints: jest.fn(),
      }))
      .mock(GraphRegistryService)
      .impl(() => ({
        findAll: jest.fn(),
      }))
      .mock(ReindexService)
      .impl(() => ({
        reindexAll: jest.fn(),
      }))
      .compile();

    service = unit;
    syncState = unitRef.get(SyncStateService) as unknown as SyncStateService;
    syncQueueProducer = unitRef.get(
      SyncQueueProducerService,
    ) as unknown as SyncQueueProducerService;
    fusekiService = unitRef.get(FusekiService) as unknown as FusekiService;
    graphRegistry = unitRef.get(
      GraphRegistryService,
    ) as unknown as GraphRegistryService;
    reindexService = unitRef.get(ReindexService) as unknown as ReindexService;
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('reconcile', () => {
    it('should detect new graphs and enqueue sync jobs', async () => {
      (syncState.get as jest.Mock).mockResolvedValue({
        activeIndexName: 'eden-test-123',
      });
      (fusekiService.listNamedGraphs as jest.Mock).mockResolvedValue([
        'eden://harvester/harmonized/https://pangaea.de/',
        'eden://harvester/embedded_jsonld/https://pangaea.de/',
      ]);
      (graphRegistry.findAll as jest.Mock).mockResolvedValue([]);

      await service.reconcile();

      expect(syncQueueProducer.enqueueSyncGraph).toHaveBeenCalledWith(
        'eden://harvester/harmonized/https://pangaea.de/',
        'eden-test-123',
        null,
      );
      expect(syncQueueProducer.enqueueSyncGraph).toHaveBeenCalledTimes(1);
    });

    it('should detect deleted graphs and enqueue delete jobs', async () => {
      (syncState.get as jest.Mock).mockResolvedValue({
        activeIndexName: 'eden-test-123',
      });
      (fusekiService.listNamedGraphs as jest.Mock).mockResolvedValue([]);
      (graphRegistry.findAll as jest.Mock).mockResolvedValue([
        {
          graphUri: 'eden://harvester/harmonized/https://pangaea.de/',
          contentHash: 'abc123',
          documentIds: ['https://pangaea.de/'],
        },
      ]);

      await service.reconcile();

      expect(syncQueueProducer.enqueueDeleteGraph).toHaveBeenCalledWith(
        'eden://harvester/harmonized/https://pangaea.de/',
        'eden-test-123',
      );
    });

    it('should detect changed graphs via fingerprint', async () => {
      const graphUri = 'eden://harvester/harmonized/https://pangaea.de/';
      (syncState.get as jest.Mock).mockResolvedValue({
        activeIndexName: 'eden-test-123',
      });
      (fusekiService.listNamedGraphs as jest.Mock).mockResolvedValue([
        graphUri,
      ]);
      (fusekiService.graphFingerprints as jest.Mock).mockResolvedValue(
        new Map([[graphUri, '84']]),
      );
      (graphRegistry.findAll as jest.Mock).mockResolvedValue([
        {
          graphUri,
          contentHash: '42',
          documentIds: ['https://pangaea.de/'],
        },
      ]);

      await service.reconcile();

      expect(syncQueueProducer.enqueueSyncGraph).toHaveBeenCalledWith(
        graphUri,
        'eden-test-123',
        null,
      );
    });

    it('should skip unchanged graphs', async () => {
      const graphUri = 'eden://harvester/harmonized/https://pangaea.de/';

      (syncState.get as jest.Mock).mockResolvedValue({
        activeIndexName: 'eden-test-123',
      });
      (fusekiService.listNamedGraphs as jest.Mock).mockResolvedValue([
        graphUri,
      ]);
      (fusekiService.graphFingerprints as jest.Mock).mockResolvedValue(
        new Map([[graphUri, '42']]),
      );
      (graphRegistry.findAll as jest.Mock).mockResolvedValue([
        { graphUri, contentHash: '42', documentIds: ['https://pangaea.de/'] },
      ]);

      await service.reconcile();

      expect(syncQueueProducer.enqueueSyncGraph).not.toHaveBeenCalled();
      expect(syncQueueProducer.enqueueDeleteGraph).not.toHaveBeenCalled();
      expect(reindexService.reindexAll).not.toHaveBeenCalled();
    });

    it('should trigger full reindex when no active index exists', async () => {
      (syncState.get as jest.Mock).mockResolvedValue({
        activeIndexName: null,
      });

      await service.reconcile();

      expect(reindexService.reindexAll).toHaveBeenCalled();
      expect(fusekiService.listNamedGraphs).not.toHaveBeenCalled();
    });

    it('should trigger full reindex on unrecoverable error', async () => {
      (syncState.get as jest.Mock).mockResolvedValue({
        activeIndexName: 'eden-test-123',
      });
      (fusekiService.listNamedGraphs as jest.Mock).mockRejectedValue(
        new Error('Fuseki down'),
      );

      await service.reconcile();

      expect(reindexService.reindexAll).toHaveBeenCalled();
    });
  });

  describe('reconcile change detection and cooldown', () => {
    it('should detect changes from fingerprints without fetching graphs', async () => {
      (syncState.get as jest.Mock).mockResolvedValue({
        id: 'singleton',
        activeIndexName: 'eden-1',
      });
      (fusekiService.listNamedGraphs as jest.Mock).mockResolvedValue([
        'eden://harvester/harmonized/a',
        'eden://harvester/harmonized/b',
      ]);
      (fusekiService.graphFingerprints as jest.Mock).mockResolvedValue(
        new Map([
          ['eden://harvester/harmonized/a', '10'],
          ['eden://harvester/harmonized/b', '20'],
        ]),
      );
      (graphRegistry.findAll as jest.Mock).mockResolvedValue([
        { graphUri: 'eden://harvester/harmonized/a', contentHash: '10' },
        { graphUri: 'eden://harvester/harmonized/b', contentHash: '19' },
      ]);

      await service.reconcile();

      expect(fusekiService.fetchGraph).not.toHaveBeenCalled();
      expect(syncQueueProducer.enqueueSyncGraph).toHaveBeenCalledTimes(1);
      expect(syncQueueProducer.enqueueSyncGraph).toHaveBeenCalledWith(
        'eden://harvester/harmonized/b',
        'eden-1',
        null,
      );
    });

    it('should skip the fallback reindex while inside the cooldown', async () => {
      (syncState.get as jest.Mock).mockResolvedValue({
        id: 'singleton',
        activeIndexName: null,
      });

      await service.reconcile();
      await service.reconcile();

      expect(reindexService.reindexAll).toHaveBeenCalledTimes(1);
    });
  });
});
