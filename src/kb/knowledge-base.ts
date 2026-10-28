// The registry knowledge base as the exporter uses it. TRSP IRIs are compact,
// such as 'trsp:att.64DA341B5F', to match the keys of the canonical context.

export interface KbProperty {
  attribute: string | null;
  mandatory: boolean;
}

export interface KbProfile {
  iri: string;
  label: string;
  minimumCoverage: number;
  properties: KbProperty[];
}

export interface KnowledgeBase {
  profiles: KbProfile[];
  // Attribute IRI to its label.
  attributeLabels: ReadonlyMap<string, string>;
  // normalizeRepositoryIri(repository) to the IRIs of the profiles it is a member of.
  memberships: ReadonlyMap<string, string[]>;
}

export const EMPTY_KNOWLEDGE_BASE: KnowledgeBase = {
  profiles: [],
  attributeLabels: new Map(),
  memberships: new Map(),
};
