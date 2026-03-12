import { LabelEnrichmentService } from './label-enrichment.service';

describe('LabelEnrichmentService', () => {
  let service: LabelEnrichmentService;

  beforeEach(() => {
    service = new LabelEnrichmentService();
  });

  it('should add rdfs:label for a generic dct:Policy node with dct:title', () => {
    const nodes = [
      {
        '@id': 'http://example.org/policy',
        '@type': 'dct:Policy',
        'dct:title': 'Access Policy',
      },
    ];

    const result = service.enrichLabels(nodes);

    expect(result[0]['rdfs:label']).toBe('Access Policy');
  });

  it('should use dct:title as label for policy with title', () => {
    const nodes = [
      {
        '@id': 'http://example.org/policy',
        '@type': 'dct:Policy',
        'dct:title': 'Privacy Policy',
      },
    ];

    const result = service.enrichLabels(nodes);

    expect(result[0]['rdfs:label']).toBe('Privacy Policy');
  });

  it('should fall back to type-based label for policy without title', () => {
    const nodes = [
      { '@id': 'http://example.org/policy', '@type': 'dct:Policy' },
    ];

    const result = service.enrichLabels(nodes);

    expect(result[0]['rdfs:label']).toBe('Policy');
  });

  it('should prefer dct:title over specific type label when title is present', () => {
    const nodes = [
      {
        '@id': 'http://example.org/policy',
        '@type': ['dct:Policy', 'premis:PreservationPolicy'],
        'dct:title': 'Our Preservation Policy',
      },
    ];

    const result = service.enrichLabels(nodes);

    expect(result[0]['rdfs:label']).toBe('Our Preservation Policy');
  });

  it('should prefer specific type over generic dct:Policy when no title', () => {
    const nodes = [
      {
        '@id': 'http://example.org/policy',
        '@type': ['dct:Policy', 'premis:PreservationPolicy'],
      },
    ];

    const result = service.enrichLabels(nodes);

    expect(result[0]['rdfs:label']).toBe('Preservation Policy');
  });

  it('should handle expanded IRI form for dct:Policy', () => {
    const nodes = [
      {
        '@id': 'http://example.org/policy',
        '@type': 'http://purl.org/dc/terms/Policy',
      },
    ];

    const result = service.enrichLabels(nodes);

    expect(result[0]['rdfs:label']).toBe('Policy');
  });

  it('should not add label for unknown types', () => {
    const nodes = [
      {
        '@id': 'http://example.org/service',
        '@type': 'dcat:DataService',
        'dct:title': 'My Service',
      },
    ];

    const result = service.enrichLabels(nodes);

    expect(result[0]['rdfs:label']).toBeUndefined();
  });

  it('should not overwrite existing rdfs:label', () => {
    const nodes = [
      {
        '@id': 'http://example.org/policy',
        '@type': 'dct:Policy',
        'rdfs:label': 'Custom Label',
      },
    ];

    const result = service.enrichLabels(nodes);

    expect(result[0]['rdfs:label']).toBe('Custom Label');
  });

  it('should handle nodes without @type', () => {
    const nodes = [{ '@id': 'http://example.org/thing' }];

    const result = service.enrichLabels(nodes);

    expect(result[0]['rdfs:label']).toBeUndefined();
  });

  it('should enrich multiple nodes independently', () => {
    const nodes = [
      { '@id': 'http://example.org/p1', '@type': 'ex:DepositionPolicy' },
      { '@id': 'http://example.org/svc', '@type': 'dcat:DataService' },
      {
        '@id': 'http://example.org/p2',
        '@type': 'ex:SustainabilityPolicy',
      },
    ];

    const result = service.enrichLabels(nodes);

    expect(result[0]['rdfs:label']).toBe('Deposition Policy');
    expect(result[1]['rdfs:label']).toBeUndefined();
    expect(result[2]['rdfs:label']).toBe('Sustainability Policy');
  });
});
