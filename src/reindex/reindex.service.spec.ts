import { TestBed } from '@suites/unit';
import { ConfigService } from '@nestjs/config';
import { ReindexService } from './reindex.service';
import { FusekiService } from '../fuseki/fuseki.service';
import { JsonldProcessingService } from '../jsonld/jsonld-processing.service';
import { ElasticsearchIndexService } from '../elasticsearch/elasticsearch-index.service';
import { GraphRegistryService } from '../graph-sync/graph-registry.service';
import { SyncStateService } from '../graph-sync/sync-state.service';
import { ELASTICSEARCH_CONFIG_KEY } from '../config';

describe('ReindexService', () => {
  let service: ReindexService;
  let fusekiService: FusekiService;
  let jsonldService: JsonldProcessingService;
  let esIndexService: ElasticsearchIndexService;
  let graphRegistryService: GraphRegistryService;
  let syncStateService: SyncStateService;

  const esAlias = 'eden-test';

  beforeEach(async () => {
    const { unit, unitRef } = await TestBed.solitary(ReindexService)
      .mock(ConfigService)
      .impl(() => ({
        get: jest.fn().mockImplementation((key: symbol) => {
          if (key === ELASTICSEARCH_CONFIG_KEY) {
            return { ELASTICSEARCH_ALIAS: esAlias };
          }
        }),
      }))
      .mock(FusekiService)
      .impl(() => ({
        fetchGraph: jest.fn(),
        listNamedGraphs: jest.fn(),
        graphFingerprints: jest.fn(),
      }))
      .mock(JsonldProcessingService)
      .impl(() => ({
        flatten: jest.fn(),
      }))
      .mock(ElasticsearchIndexService)
      .impl(() => ({
        ensureIndex: jest.fn(),
        bulkIndex: jest.fn(),
        swapAlias: jest.fn(),
        deleteIndex: jest.fn(),
        pruneStaleIndices: jest.fn(),
      }))
      .mock(GraphRegistryService)
      .impl(() => ({
        deleteAll: jest.fn(),
        upsert: jest.fn(),
      }))
      .mock(SyncStateService)
      .impl(() => ({
        get: jest.fn(),
        updateActiveIndex: jest.fn(),
      }))
      .compile();

    service = unit;
    fusekiService = unitRef.get(FusekiService) as unknown as FusekiService;
    jsonldService = unitRef.get(
      JsonldProcessingService,
    ) as unknown as JsonldProcessingService;
    esIndexService = unitRef.get(
      ElasticsearchIndexService,
    ) as unknown as ElasticsearchIndexService;
    graphRegistryService = unitRef.get(
      GraphRegistryService,
    ) as unknown as GraphRegistryService;
    syncStateService = unitRef.get(
      SyncStateService,
    ) as unknown as SyncStateService;
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('reindexAll', () => {
    const flattenedDocs = [
      { '@id': 'http://example.org/doc/1', title: 'Doc 1' },
      { '@id': 'http://example.org/doc/2', title: 'Doc 2' },
    ];

    it('should perform full reindex with blue-green swap', async () => {
      (syncStateService.get as jest.Mock).mockResolvedValue({
        id: 'singleton',
        activeIndexName: 'eden-test-old',
      });
      (fusekiService.listNamedGraphs as jest.Mock).mockResolvedValue([
        'eden://harvester/harmonized/https://example.org/',
      ]);
      (fusekiService.graphFingerprints as jest.Mock).mockResolvedValue(
        new Map([['eden://harvester/harmonized/https://example.org/', '42']]),
      );
      (fusekiService.fetchGraph as jest.Mock).mockResolvedValue({
        '@context': {},
        '@graph': [],
      });
      (jsonldService.flatten as jest.Mock).mockResolvedValue(flattenedDocs);

      await service.reindexAll();

      expect(esIndexService.ensureIndex).toHaveBeenCalledWith(
        expect.stringMatching(/^eden-test-\d+$/),
      );
      expect(graphRegistryService.deleteAll).toHaveBeenCalled();
      expect(fusekiService.fetchGraph).toHaveBeenCalledWith(
        'eden://harvester/harmonized/https://example.org/',
      );
      expect(jsonldService.flatten).toHaveBeenCalled();
      expect(esIndexService.bulkIndex).toHaveBeenCalledWith(
        expect.stringMatching(/^eden-test-\d+$/),
        flattenedDocs,
      );
      expect(graphRegistryService.upsert).toHaveBeenCalledWith(
        'eden://harvester/harmonized/https://example.org/',
        ['http://example.org/doc/1', 'http://example.org/doc/2'],
        '42',
      );
      expect(esIndexService.swapAlias).toHaveBeenCalledWith(
        esAlias,
        expect.stringMatching(/^eden-test-\d+$/),
      );
      expect(syncStateService.updateActiveIndex).toHaveBeenCalledWith(
        expect.stringMatching(/^eden-test-\d+$/),
      );
      expect(esIndexService.pruneStaleIndices).toHaveBeenCalledWith(esAlias, [
        expect.stringMatching(/^eden-test-\d+$/),
      ]);
    });

    it('should only index harmonized graphs', async () => {
      (syncStateService.get as jest.Mock).mockResolvedValue({
        id: 'singleton',
        activeIndexName: null,
      });
      (fusekiService.listNamedGraphs as jest.Mock).mockResolvedValue([
        'eden://harvester/embedded_jsonld/https://example.org/',
        'eden://harvester/harmonized/https://example.org/',
        'eden://harvester/re3data/https://example.org/',
      ]);
      (fusekiService.graphFingerprints as jest.Mock).mockResolvedValue(
        new Map(),
      );
      (fusekiService.fetchGraph as jest.Mock).mockResolvedValue({
        '@context': {},
        '@graph': [],
      });
      (jsonldService.flatten as jest.Mock).mockResolvedValue([]);

      await service.reindexAll();

      expect(fusekiService.fetchGraph).toHaveBeenCalledTimes(1);
      expect(fusekiService.fetchGraph).toHaveBeenCalledWith(
        'eden://harvester/harmonized/https://example.org/',
      );
    });

    it('should delete the new index and rethrow when indexing fails', async () => {
      (syncStateService.get as jest.Mock).mockResolvedValue({
        id: 'singleton',
        activeIndexName: 'eden-test-old',
      });
      (fusekiService.listNamedGraphs as jest.Mock).mockResolvedValue([
        'eden://harvester/harmonized/https://example.org/',
      ]);
      (fusekiService.graphFingerprints as jest.Mock).mockResolvedValue(
        new Map([['eden://harvester/harmonized/https://example.org/', '42']]),
      );
      (fusekiService.fetchGraph as jest.Mock).mockRejectedValue(
        new Error('fuseki unavailable'),
      );

      await expect(service.reindexAll()).rejects.toThrow('fuseki unavailable');

      expect(esIndexService.deleteIndex).toHaveBeenCalledWith(
        expect.stringMatching(/^eden-test-\d+$/),
      );
      expect(esIndexService.swapAlias).not.toHaveBeenCalled();
      expect(syncStateService.updateActiveIndex).not.toHaveBeenCalled();
    });

    it('should still rethrow when cleaning up the failed index fails', async () => {
      (syncStateService.get as jest.Mock).mockResolvedValue({
        id: 'singleton',
        activeIndexName: null,
      });
      (fusekiService.listNamedGraphs as jest.Mock).mockRejectedValue(
        new Error('fuseki unavailable'),
      );
      (esIndexService.deleteIndex as jest.Mock).mockRejectedValue(
        new Error('index not found'),
      );

      await expect(service.reindexAll()).rejects.toThrow('fuseki unavailable');
    });

  });
});
