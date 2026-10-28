import { Injectable, Logger } from '@nestjs/common';
import { FusekiService } from '../fuseki/fuseki.service';
import { normalizeRepositoryIri } from '../jsonld/repository-iri';
import {
  EMPTY_KNOWLEDGE_BASE,
  type KbProfile,
  type KnowledgeBase,
} from './knowledge-base';

type Row = Record<string, { value: string }>;

const PREFIXES = `PREFIX edenkb: <https://w3id.org/eosc-eden/kb#>
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
PREFIX dct: <http://purl.org/dc/terms/>
`;

const PROFILES_QUERY = `${PREFIXES}
SELECT ?profile ?label ?coverage ?property ?attribute ?mandatory WHERE { GRAPH <eden://kb/definitions> {
  ?profile a edenkb:Profile ; skos:prefLabel ?label ; edenkb:minimumCoverage ?coverage .
  ?property edenkb:profile ?profile .
  OPTIONAL { ?property skos:exactMatch|skos:closeMatch ?attribute }
  OPTIONAL { ?property edenkb:mandatory ?mandatory } } }`;

const ATTRIBUTE_LABELS_QUERY = `${PREFIXES}
SELECT ?attribute ?label WHERE { GRAPH <eden://kb/definitions> {
  ?attribute a skos:Concept ; skos:prefLabel ?label .
  FILTER(STRSTARTS(STR(?attribute), "https://w3id.org/trsp/att.")) } }`;

const MEMBERSHIPS_QUERY = `${PREFIXES}
SELECT ?repository ?profile WHERE { GRAPH ?g { ?repository dct:isPartOf ?profile }
  FILTER(STRSTARTS(STR(?g), "eden://kb/memberships/")) }`;

const TRSP = 'https://w3id.org/trsp/';

const compact = (iri: string): string =>
  iri.startsWith(TRSP) ? `trsp:${iri.slice(TRSP.length)}` : iri;

// One row per profile property; a property belongs to exactly one profile.
const toProfiles = (rows: Row[]): KbProfile[] => {
  const profiles = new Map<string, KbProfile>();
  const seen = new Set<string>();
  for (const {
    profile,
    label,
    coverage,
    property,
    attribute,
    mandatory,
  } of rows) {
    const iri = compact(profile.value);
    if (!profiles.has(iri)) {
      profiles.set(iri, {
        iri,
        label: label.value,
        minimumCoverage: Number(coverage.value),
        properties: [],
      });
    }
    if (seen.has(property.value)) continue;
    seen.add(property.value);
    profiles.get(iri)!.properties.push({
      attribute: attribute ? compact(attribute.value) : null,
      mandatory: mandatory?.value === 'true',
    });
  }
  return [...profiles.values()];
};

const toMemberships = (rows: Row[]): Map<string, string[]> => {
  const memberships = new Map<string, string[]>();
  for (const { repository, profile } of rows) {
    const key = normalizeRepositoryIri(repository.value);
    const profiles = memberships.get(key) ?? [];
    const iri = compact(profile.value);
    if (!profiles.includes(iri)) profiles.push(iri);
    memberships.set(key, profiles);
  }
  return memberships;
};

@Injectable()
export class KbService {
  private readonly logger = new Logger(KbService.name);
  private warned = false;

  constructor(private readonly fusekiService: FusekiService) {}

  async load(): Promise<KnowledgeBase> {
    try {
      const [profileRows, labelRows, membershipRows] = await Promise.all([
        this.fusekiService.select(PROFILES_QUERY),
        this.fusekiService.select(ATTRIBUTE_LABELS_QUERY),
        this.fusekiService.select(MEMBERSHIPS_QUERY),
      ]);
      const profiles = toProfiles(profileRows);
      if (profiles.length === 0) {
        return this.empty('eden://kb/definitions has no profiles');
      }
      this.warned = false;
      return {
        profiles,
        attributeLabels: new Map(
          labelRows.map(({ attribute, label }) => [
            compact(attribute.value),
            label.value,
          ]),
        ),
        memberships: toMemberships(membershipRows),
      };
    } catch (error) {
      return this.empty((error as Error).message);
    }
  }

  // Warns once until a load finds profiles again, so an exporter without a
  // knowledge base does not warn for every graph it indexes.
  private empty(reason: string): KnowledgeBase {
    if (!this.warned) {
      this.logger.warn(
        `Knowledge base not loaded (${reason}); profiles and memberships are not assigned`,
      );
      this.warned = true;
    }
    return EMPTY_KNOWLEDGE_BASE;
  }
}
