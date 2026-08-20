import { ConfigService } from '@nestjs/config';
import { JsonldProcessingService } from './jsonld-processing.service';
import { LabelEnrichmentService } from './label-enrichment.service';
import { QualityMeasurementsService } from './quality-measurements.service';
import { FUSEKI_CONFIG_KEY } from '../config';

describe('JsonldProcessingService', () => {
  let service: JsonldProcessingService;

  beforeEach(() => {
    const configService = {
      get: (key: symbol) =>
        key === FUSEKI_CONFIG_KEY
          ? { FUSEKI_ENDPOINT: 'http://fuseki:3030/eden' }
          : undefined,
    } as unknown as ConfigService;

    service = new JsonldProcessingService(
      new LabelEnrichmentService(),
      new QualityMeasurementsService(),
      configService,
    );
  });

  describe('flatten', () => {
    it('should flatten a JSON-LD document and return URI nodes', async () => {
      const document = {
        '@context': {
          dct: 'http://purl.org/dc/terms/',
          dcat: 'http://www.w3.org/ns/dcat#',
        },
        '@id': 'http://example.org/resource1',
        '@type': 'dcat:CatalogRecord',
        'dct:title': 'Test Resource',
      };

      const result = await service.flatten(document);

      expect(result).toHaveLength(1);
      expect(result[0]['@id']).toBe('http://example.org/resource1');
      expect(result[0]['@type']).toEqual(['dcat:CatalogRecord']);
    });

    it('should embed blank nodes into parent documents', async () => {
      const document = {
        '@context': {
          dct: 'http://purl.org/dc/terms/',
          dcat: 'http://www.w3.org/ns/dcat#',
          prov: 'http://www.w3.org/ns/prov#',
        },
        '@id': 'http://example.org/record1',
        '@type': 'dcat:CatalogRecord',
        'prov:wasGeneratedBy': {
          '@type': 'prov:Activity',
          'prov:name': 'Harvesting',
        },
      };

      const result = await service.flatten(document);

      expect(result).toHaveLength(1);
      const record = result[0];
      expect(record['@id']).toBe('http://example.org/record1');

      const activity = record['prov:wasGeneratedBy'] as Record<string, unknown>;
      expect(activity).toBeDefined();
      expect(activity['@type']).toBe('prov:Activity');
      expect(activity['prov:name']).toBe('Harvesting');
      expect(activity['@id']).toBeUndefined();
    });

    it('should handle multiple blank nodes in arrays', async () => {
      const document = {
        '@context': {
          dct: 'http://purl.org/dc/terms/',
          dcat: 'http://www.w3.org/ns/dcat#',
          foaf: 'http://xmlns.com/foaf/0.1/',
        },
        '@id': 'http://example.org/catalog1',
        '@type': 'dcat:Catalog',
        'dct:publisher': [
          { '@type': 'foaf:Agent', 'foaf:name': 'Agent A' },
          { '@type': 'foaf:Agent', 'foaf:name': 'Agent B' },
        ],
      };

      const result = await service.flatten(document);

      expect(result).toHaveLength(1);
      const catalog = result[0];
      const publishers = catalog['dct:publisher'] as Array<
        Record<string, unknown>
      >;
      expect(publishers).toHaveLength(2);
      expect(publishers[0]['foaf:name']).toBe('Agent A');
      expect(publishers[1]['foaf:name']).toBe('Agent B');
    });

    it('should produce separate documents for multiple URI nodes', async () => {
      const document = {
        '@context': {
          dct: 'http://purl.org/dc/terms/',
          dcat: 'http://www.w3.org/ns/dcat#',
        },
        '@graph': [
          {
            '@id': 'http://example.org/resource1',
            '@type': 'dcat:CatalogRecord',
            'dct:title': 'Resource 1',
          },
          {
            '@id': 'http://example.org/resource2',
            '@type': 'dcat:Catalog',
            'dct:title': 'Resource 2',
          },
        ],
      };

      const result = await service.flatten(document);

      expect(result).toHaveLength(2);
      const ids = result.map((doc) => doc['@id']);
      expect(ids).toContain('http://example.org/resource1');
      expect(ids).toContain('http://example.org/resource2');
    });

    it('should handle documents without @context', async () => {
      const document = {
        '@id': 'http://example.org/resource1',
        '@type': 'http://www.w3.org/ns/dcat#CatalogRecord',
        'http://purl.org/dc/terms/title': 'Test',
      };

      const result = await service.flatten(document);

      expect(result).toHaveLength(1);
      expect(result[0]['@id']).toBe('http://example.org/resource1');
    });

    it('should handle empty @graph', async () => {
      const document = {
        '@context': { dct: 'http://purl.org/dc/terms/' },
        '@graph': [],
      };

      const result = await service.flatten(document);

      expect(result).toHaveLength(0);
    });

    it('should preserve RDF value objects with @language', async () => {
      const document = {
        '@context': {
          dct: 'http://purl.org/dc/terms/',
        },
        '@id': 'http://example.org/resource1',
        'dct:title': { '@value': 'Test', '@language': 'en' },
      };

      const result = await service.flatten(document);

      expect(result).toHaveLength(1);
      const title = result[0]['dct:title'] as Record<string, unknown>;
      expect(title['@value']).toBe('Test');
      expect(title['@language']).toBe('en');
    });

    it('should handle nested blank nodes', async () => {
      const document = {
        '@context': {
          dcat: 'http://www.w3.org/ns/dcat#',
          dct: 'http://purl.org/dc/terms/',
        },
        '@id': 'http://example.org/root',
        'dcat:record': {
          'dcat:distribution': {
            'dct:title': 'Deeply Nested',
          },
        },
      };

      const result = await service.flatten(document);

      expect(result).toHaveLength(1);
      const root = result[0];
      const child = root['dcat:record'] as Record<string, unknown>;
      expect(child).toBeDefined();
      expect(child['@id']).toBeUndefined();
      const grandchild = child['dcat:distribution'] as Record<string, unknown>;
      expect(grandchild).toBeDefined();
      expect(grandchild['dct:title']).toBe('Deeply Nested');
    });

    it('should collapse URI reference objects to plain strings', async () => {
      const document = {
        '@context': {
          dct: 'http://purl.org/dc/terms/',
          dcat: 'http://www.w3.org/ns/dcat#',
        },
        '@graph': [
          {
            '@id': 'http://example.org/record1',
            '@type': 'dcat:CatalogRecord',
            'dct:conformsTo': { '@id': 'http://example.org/policy' },
          },
          {
            '@id': 'http://example.org/policy',
            '@type': 'dct:Policy',
            'dct:title': 'Some Policy',
          },
        ],
      };

      const result = await service.flatten(document);

      const record = result.find(
        (n) => n['@id'] === 'http://example.org/record1',
      );
      expect(record!['dct:conformsTo']).toBe('http://example.org/policy');
    });

    it('should collapse URI references inside arrays', async () => {
      const document = {
        '@context': {
          dct: 'http://purl.org/dc/terms/',
          dcat: 'http://www.w3.org/ns/dcat#',
        },
        '@graph': [
          {
            '@id': 'http://example.org/record1',
            '@type': 'dcat:CatalogRecord',
            'dct:conformsTo': [
              { '@id': 'http://example.org/policy1' },
              { '@id': 'http://example.org/policy2' },
            ],
          },
          {
            '@id': 'http://example.org/policy1',
            '@type': 'dct:Policy',
          },
          {
            '@id': 'http://example.org/policy2',
            '@type': 'dct:Policy',
          },
        ],
      };

      const result = await service.flatten(document);

      const record = result.find(
        (n) => n['@id'] === 'http://example.org/record1',
      );
      expect(record!['dct:conformsTo']).toEqual([
        'http://example.org/policy1',
        'http://example.org/policy2',
      ]);
    });

    it('should produce consistent string types for mixed string and URI ref values', async () => {
      const document = {
        '@context': {
          dct: 'http://purl.org/dc/terms/',
          dcat: 'http://www.w3.org/ns/dcat#',
        },
        '@graph': [
          {
            '@id': 'http://example.org/record1',
            '@type': 'dcat:CatalogRecord',
            'dct:conformsTo': 'https://www.sitemaps.org/protocol.html',
          },
          {
            '@id': 'http://example.org/record2',
            '@type': 'dcat:CatalogRecord',
            'dct:conformsTo': { '@id': 'http://example.org/policy' },
          },
          {
            '@id': 'http://example.org/policy',
            '@type': 'dct:Policy',
          },
        ],
      };

      const result = await service.flatten(document);

      const record1 = result.find(
        (n) => n['@id'] === 'http://example.org/record1',
      );
      const record2 = result.find(
        (n) => n['@id'] === 'http://example.org/record2',
      );
      expect(typeof record1!['dct:conformsTo']).toBe('string');
      expect(typeof record2!['dct:conformsTo']).toBe('string');
    });

    it('should embed blank nodes and collapse URI refs in the same document', async () => {
      const document = {
        '@context': {
          dct: 'http://purl.org/dc/terms/',
          dcat: 'http://www.w3.org/ns/dcat#',
          prov: 'http://www.w3.org/ns/prov#',
        },
        '@id': 'http://example.org/record1',
        '@type': 'dcat:CatalogRecord',
        'prov:wasGeneratedBy': {
          '@type': 'prov:Activity',
          'prov:name': 'Harvesting',
        },
        'dct:conformsTo': { '@id': 'http://example.org/policy' },
      };

      const result = await service.flatten(document);

      expect(result).toHaveLength(1);
      const record = result[0];

      const activity = record['prov:wasGeneratedBy'] as Record<string, unknown>;
      expect(activity['@type']).toBe('prov:Activity');
      expect(activity['prov:name']).toBe('Harvesting');
      expect(activity['@id']).toBeUndefined();

      expect(record['dct:conformsTo']).toBe('http://example.org/policy');
    });

    it('should add _referencedBy when a document references another', async () => {
      const document = {
        '@context': {
          dct: 'http://purl.org/dc/terms/',
          dcat: 'http://www.w3.org/ns/dcat#',
        },
        '@graph': [
          {
            '@id': 'http://example.org/catalog',
            '@type': 'dcat:Catalog',
            'dcat:service': { '@id': 'http://example.org/service' },
          },
          {
            '@id': 'http://example.org/service',
            '@type': 'dcat:DataService',
            'dct:title': 'My Service',
          },
        ],
      };

      const result = await service.flatten(document);

      const svc = result.find((n) => n['@id'] === 'http://example.org/service');
      expect(svc!['_referencedBy']).toEqual(['http://example.org/catalog']);
    });

    it('should collect multiple parents in _referencedBy', async () => {
      const document = {
        '@context': {
          dct: 'http://purl.org/dc/terms/',
          dcat: 'http://www.w3.org/ns/dcat#',
        },
        '@graph': [
          {
            '@id': 'http://example.org/catalog1',
            '@type': 'dcat:Catalog',
            'dct:conformsTo': { '@id': 'http://example.org/policy' },
          },
          {
            '@id': 'http://example.org/catalog2',
            '@type': 'dcat:Catalog',
            'dct:conformsTo': { '@id': 'http://example.org/policy' },
          },
          {
            '@id': 'http://example.org/policy',
            '@type': 'dct:Standard',
            'dct:title': 'Shared Standard',
          },
        ],
      };

      const result = await service.flatten(document);

      const standard = result.find(
        (n) => n['@id'] === 'http://example.org/policy',
      );
      expect(standard!['_referencedBy']).toHaveLength(2);
      expect(standard!['_referencedBy']).toContain(
        'http://example.org/catalog1',
      );
      expect(standard!['_referencedBy']).toContain(
        'http://example.org/catalog2',
      );
    });

    it('should not add _referencedBy for self-references', async () => {
      const document = {
        '@context': {
          dct: 'http://purl.org/dc/terms/',
          dcat: 'http://www.w3.org/ns/dcat#',
        },
        '@id': 'http://example.org/resource1',
        '@type': 'dcat:CatalogRecord',
        'dct:title': 'Test Resource',
      };

      const result = await service.flatten(document);

      expect(result[0]['_referencedBy']).toBeUndefined();
    });

    it('should not add _referencedBy when no documents reference each other', async () => {
      const document = {
        '@context': {
          dct: 'http://purl.org/dc/terms/',
          dcat: 'http://www.w3.org/ns/dcat#',
        },
        '@graph': [
          {
            '@id': 'http://example.org/resource1',
            '@type': 'dcat:CatalogRecord',
            'dct:title': 'Resource 1',
          },
          {
            '@id': 'http://example.org/resource2',
            '@type': 'dcat:Catalog',
            'dct:title': 'Resource 2',
          },
        ],
      };

      const result = await service.flatten(document);

      expect(result[0]['_referencedBy']).toBeUndefined();
      expect(result[1]['_referencedBy']).toBeUndefined();
    });

    it('should add _policy field with resolved policy titles', async () => {
      const document = {
        '@context': {
          dct: 'http://purl.org/dc/terms/',
          dcat: 'http://www.w3.org/ns/dcat#',
        },
        '@graph': [
          {
            '@id': 'http://example.org/catalog',
            '@type': 'dcat:Catalog',
            'dct:conformsTo': { '@id': 'http://example.org/policy' },
          },
          {
            '@id': 'http://example.org/policy',
            '@type': 'dct:Policy',
            'dct:title': 'My Access Policy',
          },
        ],
      };

      const result = await service.flatten(document);

      const catalog = result.find(
        (n) => n['@id'] === 'http://example.org/catalog',
      );
      expect(catalog!['_policy']).toEqual(['My Access Policy']);
      expect(catalog!['dct:conformsTo']).toBe('http://example.org/policy');
    });

    it('should not add _policy when conformsTo points to non-policy documents', async () => {
      const document = {
        '@context': {
          dct: 'http://purl.org/dc/terms/',
          dcat: 'http://www.w3.org/ns/dcat#',
        },
        '@id': 'http://example.org/service',
        '@type': 'dcat:DataService',
        'dct:conformsTo': 'http://www.openarchives.org/OAI/2.0/',
      };

      const result = await service.flatten(document);

      expect(result[0]['dct:conformsTo']).toBe(
        'http://www.openarchives.org/OAI/2.0/',
      );
      expect(result[0]['_policy']).toBeUndefined();
    });

    it('drops policy documents but keeps their titles as _policy on referrers', async () => {
      const document = {
        '@context': {
          dct: 'http://purl.org/dc/terms/',
          dcat: 'http://www.w3.org/ns/dcat#',
        },
        '@graph': [
          {
            '@id': 'http://example.org/catalog',
            '@type': 'dcat:Catalog',
            'dct:conformsTo': { '@id': 'http://example.org/policy' },
          },
          {
            '@id': 'http://example.org/policy',
            '@type': 'dct:Policy',
            'dct:title': 'Some Policy',
          },
        ],
      };

      const result = await service.flatten(document);

      const policy = result.find(
        (n) => n['@id'] === 'http://example.org/policy',
      );
      expect(policy).toBeUndefined();

      const catalog = result.find(
        (n) => n['@id'] === 'http://example.org/catalog',
      );
      expect(catalog!['_policy']).toEqual(['Some Policy']);
    });
  });

  describe('_category derivation', () => {
    it('tags dcat:DataService as data-service', async () => {
      const result = await service.flatten({
        '@context': { dcat: 'http://www.w3.org/ns/dcat#' },
        '@id': 'http://example.org/svc',
        '@type': 'dcat:DataService',
      });
      expect(result[0]['_category']).toEqual(['data-service']);
    });

    it('drops dct:Policy documents from the output entirely', async () => {
      const result = await service.flatten({
        '@context': { dct: 'http://purl.org/dc/terms/' },
        '@id': 'http://example.org/p',
        '@type': 'dct:Policy',
      });
      expect(result).toHaveLength(0);
    });

    it('tags dct:Standard as standard', async () => {
      const result = await service.flatten({
        '@context': { dct: 'http://purl.org/dc/terms/' },
        '@id': 'http://example.org/s',
        '@type': 'dct:Standard',
      });
      expect(result[0]['_category']).toEqual(['standard']);
    });

    it('tags dcat:CatalogRecord as _internal', async () => {
      const result = await service.flatten({
        '@context': { dcat: 'http://www.w3.org/ns/dcat#' },
        '@id': 'http://example.org/rec',
        '@type': 'dcat:CatalogRecord',
      });
      expect(result[0]['_category']).toEqual(['_internal']);
    });

    it('tags prov:Activity as _internal', async () => {
      const result = await service.flatten({
        '@context': { prov: 'http://www.w3.org/ns/prov#' },
        '@id': 'http://example.org/act',
        '@type': 'prov:Activity',
      });
      expect(result[0]['_category']).toEqual(['_internal']);
    });

    it('tags primary-topic (dcat:Catalog + foaf:Project) as repository', async () => {
      const result = await service.flatten({
        '@context': {
          dcat: 'http://www.w3.org/ns/dcat#',
          foaf: 'http://xmlns.com/foaf/0.1/',
        },
        '@id': 'http://example.org/repo',
        '@type': ['dcat:Catalog', 'foaf:Project'],
      });
      expect(result[0]['_category']).toEqual(['repository']);
    });

    it('refines primary-topic to standard when dct:type says so', async () => {
      const result = await service.flatten({
        '@context': {
          dcat: 'http://www.w3.org/ns/dcat#',
          dct: 'http://purl.org/dc/terms/',
          foaf: 'http://xmlns.com/foaf/0.1/',
        },
        '@id': 'http://example.org/std',
        '@type': ['dcat:Catalog', 'foaf:Project'],
        'dct:type': 'fairsharing:standard',
      });
      expect(result[0]['_category']).toEqual(['standard']);
    });

    it('drops policy-typed primary-topics from the output entirely', async () => {
      const result = await service.flatten({
        '@context': {
          dcat: 'http://www.w3.org/ns/dcat#',
          dct: 'http://purl.org/dc/terms/',
          foaf: 'http://xmlns.com/foaf/0.1/',
        },
        '@id': 'http://example.org/pol',
        '@type': ['dcat:Catalog', 'foaf:Project'],
        'dct:type': ['fairsharing:policy', 'something-else'],
      });
      expect(result).toHaveLength(0);
    });

    it('falls back to other when no rule matches', async () => {
      const result = await service.flatten({
        '@context': { ex: 'http://example.org/' },
        '@id': 'http://example.org/x',
        '@type': 'ex:Unknown',
      });
      expect(result[0]['_category']).toEqual(['other']);
    });

    it('recognises expanded @type IRIs', async () => {
      const result = await service.flatten({
        '@id': 'http://example.org/svc',
        '@type': 'http://www.w3.org/ns/dcat#DataService',
      });
      expect(result[0]['_category']).toEqual(['data-service']);
    });
  });

  describe('_parent derivation', () => {
    it('sets _parent on a data-service referenced by a repository', async () => {
      const result = await service.flatten({
        '@context': {
          dcat: 'http://www.w3.org/ns/dcat#',
          foaf: 'http://xmlns.com/foaf/0.1/',
        },
        '@graph': [
          {
            '@id': 'http://example.org/repo',
            '@type': ['dcat:Catalog', 'foaf:Project'],
            'dcat:service': { '@id': 'http://example.org/svc' },
          },
          {
            '@id': 'http://example.org/svc',
            '@type': 'dcat:DataService',
          },
        ],
      });
      const svc = result.find((n) => n['@id'] === 'http://example.org/svc');
      expect(svc!['_parent']).toBe('http://example.org/repo');
    });

    it('follows CatalogRecord foaf:primaryTopic when the direct referrer is _internal', async () => {
      const result = await service.flatten({
        '@context': {
          dcat: 'http://www.w3.org/ns/dcat#',
          dct: 'http://purl.org/dc/terms/',
          foaf: 'http://xmlns.com/foaf/0.1/',
        },
        '@graph': [
          {
            '@id': 'eden://harvester/re3data/https://example.org/repo',
            '@type': 'dcat:CatalogRecord',
            'foaf:primaryTopic': { '@id': 'https://example.org/repo' },
            'dcat:service': { '@id': 'http://example.org/svc' },
          },
          {
            '@id': 'http://example.org/svc',
            '@type': 'dcat:DataService',
            'dct:title': 'Some Service',
          },
        ],
      });
      const svc = result.find((n) => n['@id'] === 'http://example.org/svc');
      expect(svc!['_parent']).toBe('https://example.org/repo');
    });

    it('extracts repo IRI from a harvester URI when CatalogRecord primaryTopic is a blank node', async () => {
      const result = await service.flatten({
        '@context': {
          dcat: 'http://www.w3.org/ns/dcat#',
          foaf: 'http://xmlns.com/foaf/0.1/',
        },
        '@graph': [
          {
            '@id': 'eden://harvester/harmonized/https://example.org/repo',
            '@type': 'dcat:CatalogRecord',
            // primaryTopic is a blank node → embedded, no string @id
            'foaf:primaryTopic': { '_:b0': { '@type': 'dcat:Catalog' } },
            'dcat:service': { '@id': 'http://example.org/svc' },
          },
          {
            '@id': 'http://example.org/svc',
            '@type': 'dcat:DataService',
          },
        ],
      });
      const svc = result.find((n) => n['@id'] === 'http://example.org/svc');
      expect(svc!['_parent']).toBe('https://example.org/repo');
    });

    it('omits _parent when there is no repository referrer and no CatalogRecord chain', async () => {
      const result = await service.flatten({
        '@context': {
          dcat: 'http://www.w3.org/ns/dcat#',
        },
        '@graph': [
          {
            '@id': 'http://example.org/orphan',
            '@type': 'dcat:DataService',
          },
        ],
      });
      const orphan = result.find(
        (n) => n['@id'] === 'http://example.org/orphan',
      );
      expect(orphan!['_parent']).toBeUndefined();
    });

    it('does not self-reference via harvester-URI extraction', async () => {
      const result = await service.flatten({
        '@context': {
          dcat: 'http://www.w3.org/ns/dcat#',
          foaf: 'http://xmlns.com/foaf/0.1/',
        },
        '@graph': [
          {
            '@id': 'eden://harvester/re3data/https://example.org/repo',
            '@type': 'dcat:CatalogRecord',
            'foaf:primaryTopic': { '@id': 'https://example.org/repo' },
          },
          {
            '@id': 'https://example.org/repo',
            '@type': ['dcat:Catalog', 'foaf:Project'],
          },
        ],
      });
      const repo = result.find((n) => n['@id'] === 'https://example.org/repo');
      expect(repo!['_parent']).toBeUndefined();
    });

    it('does not set _parent on a repository itself', async () => {
      const result = await service.flatten({
        '@context': {
          dcat: 'http://www.w3.org/ns/dcat#',
          foaf: 'http://xmlns.com/foaf/0.1/',
        },
        '@id': 'http://example.org/repo',
        '@type': ['dcat:Catalog', 'foaf:Project'],
      });
      expect(result[0]['_parent']).toBeUndefined();
    });
  });

  describe('always-array invariants', () => {
    it('wraps scalar @type in an array on the top-level doc', async () => {
      const result = await service.flatten({
        '@context': { dcat: 'http://www.w3.org/ns/dcat#' },
        '@id': 'http://example.org/x',
        '@type': 'dcat:Catalog',
      });
      expect(Array.isArray(result[0]['@type'])).toBe(true);
      expect(result[0]['@type']).toEqual(['dcat:Catalog']);
    });

    it('leaves array @type unchanged', async () => {
      const result = await service.flatten({
        '@context': {
          dcat: 'http://www.w3.org/ns/dcat#',
          foaf: 'http://xmlns.com/foaf/0.1/',
        },
        '@id': 'http://example.org/x',
        '@type': ['dcat:Catalog', 'foaf:Project'],
      });
      expect(result[0]['@type']).toEqual(['dcat:Catalog', 'foaf:Project']);
    });

    it('keeps _policy as an array even when only one policy matches', async () => {
      const result = await service.flatten({
        '@context': {
          dct: 'http://purl.org/dc/terms/',
          dcat: 'http://www.w3.org/ns/dcat#',
        },
        '@graph': [
          {
            '@id': 'http://example.org/catalog',
            '@type': 'dcat:Catalog',
            'dct:conformsTo': { '@id': 'http://example.org/p' },
          },
          {
            '@id': 'http://example.org/p',
            '@type': 'dct:Policy',
            'dct:title': 'Single Policy',
          },
        ],
      });
      const catalog = result.find(
        (n) => n['@id'] === 'http://example.org/catalog',
      );
      expect(catalog!['_policy']).toEqual(['Single Policy']);
    });
  });

  describe('canonical prefixes', () => {
    it('should emit dct: regardless of the prefix the document used', async () => {
      const document = {
        '@context': {
          dc: 'http://purl.org/dc/terms/',
          dcat: 'http://www.w3.org/ns/dcat#',
        },
        '@graph': [
          {
            '@id': 'https://example.org/thing',
            '@type': 'dcat:Catalog',
            'dc:title': 'A catalog',
          },
        ],
      };

      const [node] = await service.flatten(document);

      expect(node['dct:title']).toBe('A catalog');
      expect(node['dc:title']).toBeUndefined();
    });

    it('should classify a policy that arrived with the dc prefix', async () => {
      const document = {
        '@context': { dc: 'http://purl.org/dc/terms/' },
        '@graph': [
          {
            '@id': 'https://example.org/policy',
            '@type': 'dc:Policy',
            'dc:title': 'Preservation policy',
          },
        ],
      };

      const result = await service.flatten(document);

      expect(result).toHaveLength(0);
    });
  });

  describe('host-baked types', () => {
    it('should repair a type IRI carrying the Fuseki host', async () => {
      const document = {
        '@context': { dcat: 'http://www.w3.org/ns/dcat#' },
        '@graph': [
          {
            '@id': 'https://example.org/thing',
            '@type': ['http://fuseki:3030/eden/CreativeWork', 'dcat:Catalog'],
          },
        ],
      };

      const [node] = await service.flatten(document);

      expect(node['@type']).toContain('schema:CreativeWork');
      expect(node['@type']).not.toContain(
        'http://fuseki:3030/eden/CreativeWork',
      );
    });
  });

  describe('conflicting dct:type', () => {
    it('should keep a catalog that also claims a policy type', async () => {
      const document = {
        '@context': {
          dcat: 'http://www.w3.org/ns/dcat#',
          dct: 'http://purl.org/dc/terms/',
          foaf: 'http://xmlns.com/foaf/0.1/',
        },
        '@graph': [
          {
            '@id': 'https://sikt.no/en/archiving-research-data',
            '@type': ['dcat:Catalog', 'foaf:Project'],
            'dct:type': ['dcat:Catalog', 'foaf:Project', 'dc:Policy'],
            'dct:title': 'Sikt Research Data Archive',
          },
        ],
      };

      const [node] = await service.flatten(document);

      expect(node).toBeDefined();
      expect(node['_category']).toEqual(['repository']);
    });

    it('should still refine an unambiguous policy dct:type', async () => {
      const document = {
        '@context': {
          dcat: 'http://www.w3.org/ns/dcat#',
          dct: 'http://purl.org/dc/terms/',
        },
        '@graph': [
          {
            '@id': 'https://example.org/policy-record',
            '@type': 'dcat:Catalog',
            'dct:type': 'fairsharing:policy',
          },
        ],
      };

      const result = await service.flatten(document);

      expect(result).toHaveLength(0);
    });

    it('should still refine an unambiguous standard dct:type', async () => {
      const document = {
        '@context': {
          dcat: 'http://www.w3.org/ns/dcat#',
          dct: 'http://purl.org/dc/terms/',
        },
        '@graph': [
          {
            '@id': 'https://example.org/standard-record',
            '@type': 'dcat:Catalog',
            'dct:type': 'fairsharing:standard',
          },
        ],
      };

      const [node] = await service.flatten(document);

      expect(node['_category']).toEqual(['standard']);
    });
  });
});
