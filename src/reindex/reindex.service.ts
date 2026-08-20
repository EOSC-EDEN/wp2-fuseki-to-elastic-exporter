import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FusekiService } from '../fuseki/fuseki.service';
import { JsonldProcessingService } from '../jsonld/jsonld-processing.service';
import { ElasticsearchIndexService } from '../elasticsearch/elasticsearch-index.service';
import { GraphRegistryService } from '../graph-sync/graph-registry.service';
import { SyncStateService } from '../graph-sync/sync-state.service';
import { ELASTICSEARCH_CONFIG_KEY, type ElasticsearchConfig } from '../config';

@Injectable()
export class ReindexService {
  private readonly logger = new Logger(ReindexService.name);
  private readonly alias: string;

  constructor(
    private readonly fusekiService: FusekiService,
    private readonly jsonldService: JsonldProcessingService,
    private readonly esIndexService: ElasticsearchIndexService,
    private readonly graphRegistryService: GraphRegistryService,
    private readonly syncStateService: SyncStateService,
    private readonly configService: ConfigService,
  ) {
    const esConfig = this.configService.get<ElasticsearchConfig>(
      ELASTICSEARCH_CONFIG_KEY,
    );
    this.alias = esConfig!.ELASTICSEARCH_ALIAS;
  }

  async reindexAll(): Promise<{
    graphs: number;
    indexed: number;
    rejected: number;
  }> {
    this.logger.log('Starting full reindex');

    const newIndexName = `${this.alias}-${Date.now()}`;
    await this.esIndexService.ensureIndex(newIndexName);
    this.logger.log(`Created new index "${newIndexName}"`);

    let graphCount = 0;
    let indexed = 0;
    let rejected = 0;

    try {
      const allGraphUris = await this.fusekiService.listNamedGraphs();
      const graphUris = allGraphUris.filter((uri) =>
        uri.includes('/harmonized/'),
      );
      graphCount = graphUris.length;
      this.logger.log(
        `Found ${allGraphUris.length} named graphs, indexing ${graphUris.length} harmonized`,
      );

      // Fetched once for the whole run: reconciliation compares against these
      // same values, so a reindex that does not record them makes every graph
      // look changed on the next tick.
      const fingerprints = await this.fusekiService.graphFingerprints();

      await this.graphRegistryService.deleteAll();

      for (const graphUri of graphUris) {
        this.logger.log(`Processing graph: ${graphUri}`);
        const document = await this.fusekiService.fetchGraph(graphUri);
        const flattenedDocs = await this.jsonldService.flatten(document);
        const docIds = flattenedDocs.map((d) => d['@id'] as string);

        const counts = await this.esIndexService.bulkIndex(
          newIndexName,
          flattenedDocs,
        );
        indexed += counts.indexed;
        rejected += counts.rejected;
        await this.graphRegistryService.upsert(
          graphUri,
          docIds,
          fingerprints.get(graphUri),
        );
      }

      await this.esIndexService.swapAlias(this.alias, newIndexName);
      await this.syncStateService.updateActiveIndex(newIndexName);
    } catch (error) {
      // The new index never received the alias, so nothing references it.
      // Leaving it behind is how hundreds of indices accumulated.
      try {
        await this.esIndexService.deleteIndex(newIndexName);
        this.logger.warn(
          `Deleted incomplete index "${newIndexName}" after a failed reindex`,
        );
      } catch (cleanupError) {
        this.logger.warn(
          `Failed to delete incomplete index "${newIndexName}": ${cleanupError}`,
        );
      }
      throw error;
    }

    await this.esIndexService.pruneStaleIndices(this.alias, [newIndexName]);

    if (rejected > 0) {
      this.logger.warn(
        `Full reindex partial: ${graphCount} graphs, ${indexed} documents indexed, ${rejected} rejected, into "${newIndexName}"`,
      );
    } else {
      this.logger.log(
        `Full reindex complete: ${graphCount} graphs, ${indexed} documents indexed into "${newIndexName}"`,
      );
    }

    return { graphs: graphCount, indexed, rejected };
  }
}
