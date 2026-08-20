// The exporter owns the JSON-LD context it flattens against, rather than
// trusting the one a document arrives with. The harvester's context binds both
// `dc` and `dct` to Dublin Core, and serializers pick whichever they like:
// Fuseki emits `dc:`, rdflib emits `dcterms:`. Field names in Elasticsearch
// would otherwise depend on which component last wrote the graph. One prefix
// per namespace makes them deterministic. `dct` is canonical because the eden
// frontend already addresses `dct:` field names.
//
// A namespace that is absent here is not an error: its terms simply survive
// flattening as full IRIs. That makes adding a vocabulary a deliberate act,
// which is the point. Add the real namespace when a vocabulary appears in the
// harmonized graphs, never a guessed one, because a wrong IRI here silently
// produces wrong field names.
export const CANONICAL_CONTEXT: Record<string, string> = {
  dcat: 'http://www.w3.org/ns/dcat#',
  dct: 'http://purl.org/dc/terms/',
  schema: 'http://schema.org/',
  vcard: 'http://www.w3.org/2006/vcard/ns#',
  foaf: 'http://xmlns.com/foaf/0.1/',
  prov: 'http://www.w3.org/ns/prov#',
  premis: 'http://www.loc.gov/premis/rdf/v3/',
  fsharing: 'http://fairsharing.org/model/fairsharing_record_schema#',
  dqv: 'http://www.w3.org/ns/dqv#',
  ldqd: 'http://www.w3.org/2016/05/ldqd#',
  skos: 'http://www.w3.org/2004/02/skos/core#',
  rdf: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#',
  rdfs: 'http://www.w3.org/2000/01/rdf-schema#',
  xsd: 'http://www.w3.org/2001/XMLSchema#',
  oa: 'http://www.w3.org/ns/oa#',
};

// Source sites publish schema.org JSON-LD in which `@type` is a bare token such
// as `CreativeWork`, relative to that site's own context. The harvester copies
// the token unprefixed, and Fuseki resolves it against the URL the write
// arrived on, so the stored type carries the writer's hostname. One dataset has
// held both http://localhost:3030/eden/CreativeWork and
// http://fuseki:3030/eden/CreativeWork for the same concept.
const KNOWN_BARE_TOKENS: Record<string, string> = {
  CreativeWork: 'schema:CreativeWork',
  Dataset: 'schema:Dataset',
  DataCatalog: 'schema:DataCatalog',
  Organization: 'schema:Organization',
  WebAPI: 'schema:WebAPI',
  WebSite: 'schema:WebSite',
  Service: 'schema:Service',
};

// Matching on the pattern rather than on the configured endpoint is deliberate:
// the dataset already contains IRIs written from a different host, and those
// must be repaired too.
const hostBakedPattern = (datasetPath: string) =>
  new RegExp(`^https?://[^/]+/${datasetPath}/([A-Za-z][A-Za-z0-9_-]*)$`);

/**
 * Repairs a type IRI that accidentally absorbed the writer's hostname.
 * Returns the normalised IRI, or null when the token is unrecognised and
 * should be dropped: a bare token in a type facet tells a user nothing.
 */
export function normalizeTypeIri(
  iri: string,
  datasetPath: string,
): string | null {
  const match = iri.match(hostBakedPattern(datasetPath));
  if (!match) return iri;

  const token = match[1];
  return KNOWN_BARE_TOKENS[token] ?? null;
}
