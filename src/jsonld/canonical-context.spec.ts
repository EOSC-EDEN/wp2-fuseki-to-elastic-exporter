import { CANONICAL_CONTEXT, normalizeTypeIri } from './canonical-context';

describe('CANONICAL_CONTEXT', () => {
  it('should bind Dublin Core to dct only', () => {
    expect(CANONICAL_CONTEXT.dct).toBe('http://purl.org/dc/terms/');
    expect(CANONICAL_CONTEXT.dc).toBeUndefined();
  });

  it('should not map two prefixes to the same namespace', () => {
    const namespaces = Object.values(CANONICAL_CONTEXT);
    expect(new Set(namespaces).size).toBe(namespaces.length);
  });
});

describe('normalizeTypeIri', () => {
  it('should remap a recognised host-baked token to its vocabulary', () => {
    expect(normalizeTypeIri('http://fuseki:3030/eden/CreativeWork', 'eden')).toBe(
      'schema:CreativeWork',
    );
  });

  it('should normalise the same token written from a different host', () => {
    expect(
      normalizeTypeIri('http://localhost:3030/eden/CreativeWork', 'eden'),
    ).toBe('schema:CreativeWork');
  });

  it('should drop an unrecognised host-baked token', () => {
    expect(normalizeTypeIri('http://fuseki:3030/eden/MadeUpThing', 'eden')).toBeNull();
  });

  it('should leave a normal type IRI untouched', () => {
    expect(normalizeTypeIri('dct:Policy', 'eden')).toBe('dct:Policy');
    expect(normalizeTypeIri('http://www.w3.org/ns/dcat#Catalog', 'eden')).toBe(
      'http://www.w3.org/ns/dcat#Catalog',
    );
  });

  it('should not touch an IRI from a different dataset path', () => {
    const iri = 'http://example.org/other/CreativeWork';
    expect(normalizeTypeIri(iri, 'eden')).toBe(iri);
  });
});
