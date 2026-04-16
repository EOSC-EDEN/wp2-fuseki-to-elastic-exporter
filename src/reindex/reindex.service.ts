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

  async reindexAll(): Promise<void> {
    this.logger.log('Starting full reindex');

    const currentState = await this.syncStateService.get();
    const oldIndexName = currentState.activeIndexName;

    const newIndexName = `${this.alias}-${Date.now()}`;
    await this.esIndexService.ensureIndex(newIndexName);
    this.logger.log(`Created new index "${newIndexName}"`);

    const allGraphUris = await this.fusekiService.listNamedGraphs();
    const graphUris = allGraphUris.filter((uri) =>
      uri.includes('/harmonized/'),
    );
    this.logger.log(
      `Found ${allGraphUris.length} named graphs, indexing ${graphUris.length} harmonized`,
    );

    await this.graphRegistryService.deleteAll();

    for (const graphUri of graphUris) {
      this.logger.log(`Processing graph: ${graphUri}`);
      const document = await this.fusekiService.fetchGraph(graphUri);
      const flattenedDocs = await this.jsonldService.flatten(document);
      const docIds = flattenedDocs.map((d) => d['@id'] as string);

      await this.esIndexService.bulkIndex(newIndexName, flattenedDocs);
      await this.graphRegistryService.upsert(graphUri, docIds);
    }

    await this.esIndexService.swapAlias(this.alias, newIndexName);
    await this.syncStateService.updateActiveIndex(newIndexName);

    if (oldIndexName) {
      try {
        await this.esIndexService.deleteIndex(oldIndexName);
      } catch (error) {
        this.logger.warn(
          `Failed to delete old index "${oldIndexName}": ${error}`,
        );
      }
    }

    this.logger.log(
      `Full reindex complete: ${graphUris.length} graphs indexed into "${newIndexName}"`,
    );
  }
}
