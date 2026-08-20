import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as jsonld from 'jsonld';
import type { ContextDefinition, JsonLdDocument } from 'jsonld';
import { LabelEnrichmentService } from './label-enrichment.service';
import { CANONICAL_CONTEXT, normalizeTypeIri } from './canonical-context';
import { QualityMeasurementsService } from './quality-measurements.service';
import { FUSEKI_CONFIG_KEY, type FusekiConfig } from '../config';

type JsonLdNode = Record<string, unknown>;

interface FlattenedDocument {
  '@context'?: ContextDefinition;
  '@graph'?: JsonLdNode[];
}

@Injectable()
export class JsonldProcessingService {
  private readonly datasetPath: string;

  constructor(
    private readonly labelEnrichment: LabelEnrichmentService,
    private readonly qualityMeasurements: QualityMeasurementsService,
    private readonly configService: ConfigService,
  ) {
    // Host-baked type IRIs carry the dataset path, so the repair needs to know
    // it. FUSEKI_ENDPOINT is a URL such as http://fuseki:3030/eden.
    const fusekiConfig =
      this.configService.get<FusekiConfig>(FUSEKI_CONFIG_KEY);
    const path = fusekiConfig?.FUSEKI_ENDPOINT
      ? new URL(fusekiConfig.FUSEKI_ENDPOINT).pathname
      : '';
    this.datasetPath = path.split('/').filter(Boolean).pop() ?? 'eden';
  }
  // W3C JSON-LD flatten returns different shapes depending on whether a context
  // is provided: an array of expanded nodes (no context) or an object with
  // @graph containing compacted nodes (with context). Both cases are handled.
  // Flattening against the exporter's own context rather than the document's
  // makes field names deterministic: the harmonized graphs bind both `dc` and
  // `dct` to Dublin Core, so the emitted prefix otherwise depends on which
  // component last serialized the graph.
  async flatten(
    document: JsonLdDocument,
    datasetPath: string = this.datasetPath,
  ): Promise<JsonLdNode[]> {
    const flattened = await jsonld.flatten(
      document,
      CANONICAL_CONTEXT as unknown as ContextDefinition,
    );

    let nodes: JsonLdNode[];
    if (Array.isArray(flattened)) {
      nodes = flattened as JsonLdNode[];
    } else {
      nodes =
        ((flattened as FlattenedDocument)['@graph'] as JsonLdNode[]) ?? [];
    }

    return this.dropPolicyDocuments(
      this.normalizeTypeArrays(
        this.deriveParent(
          this.deriveCategory(
            this.addPolicyLabels(
              this.labelEnrichment.enrichLabels(
                this.addBackReferences(
                  this.qualityMeasurements.fold(
                    this.repairHostBakedTypes(
                      this.embedBlankNodes(nodes),
                      datasetPath,
                    ),
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }

  // Runs before category derivation so a repaired type is what the rules see.
  private repairHostBakedTypes(
    nodes: JsonLdNode[],
    datasetPath: string,
  ): JsonLdNode[] {
    return nodes.map((node) => {
      const type = node['@type'];
      if (type === undefined) return node;

      const types = Array.isArray(type) ? type : [type];
      const repaired = types
        .map((t) =>
          typeof t === 'string' ? normalizeTypeIri(t, datasetPath) : t,
        )
        .filter((t): t is string => typeof t === 'string');

      if (repaired.length === 0) {
        const withoutType = { ...node };
        delete withoutType['@type'];
        return withoutType;
      }

      return { ...node, '@type': repaired };
    });
  }

  // Policies are evidence backing a repository's policy attributes, not
  // standalone records: the graph in Fuseki remains the system of record for
  // them, but they are not projected into the search index. Their titles
  // survive on the referencing documents as the _policy field (computed in
  // addPolicyLabels, which runs before this drop), and dct:conformsTo keeps
  // the links to the actual documents on the web.
  private dropPolicyDocuments(nodes: JsonLdNode[]): JsonLdNode[] {
    return nodes.filter(
      (node) => !(node['_category'] as string[]).includes('policy'),
    );
  }

  // A clean relational key for UI facets: `_parent` holds the @id of the
  // owning repository. Lets a "Parent repository" facet drive drill-down with
  // a plain term filter, skipping the mixture of bare-IRI and
  // eden://harvester/... values that _referencedBy carries.
  //
  // Two resolution strategies, tried in order:
  //   1. Direct: a referrer is itself a repository → use its @id.
  //   2. Indirect via CatalogRecord: the harvester links records to policies
  //      and services via a dcat:CatalogRecord wrapper; that wrapper's
  //      foaf:primaryTopic is the canonical repo IRI, so we follow it.
  //
  // Runs after deriveCategory so referrer categories are available.
  private deriveParent(nodes: JsonLdNode[]): JsonLdNode[] {
    const nodeById = new Map<string, JsonLdNode>(
      nodes.map((n) => [n['@id'] as string, n]),
    );

    const CATALOG_RECORD_TYPES = new Set([
      'dcat:CatalogRecord',
      'http://www.w3.org/ns/dcat#CatalogRecord',
    ]);

    const hasCatalogRecordType = (referrer: JsonLdNode): boolean => {
      const t = referrer['@type'];
      if (Array.isArray(t)) {
        return t.some(
          (v) => typeof v === 'string' && CATALOG_RECORD_TYPES.has(v),
        );
      }
      return typeof t === 'string' && CATALOG_RECORD_TYPES.has(t);
    };

    return nodes.map((node) => {
      const refs = node['_referencedBy'];
      if (!Array.isArray(refs)) return node;
      const selfId = node['@id'] as string | undefined;
      const setParent = (value: string) =>
        value === selfId ? node : { ...node, _parent: value };

      // Priority 1: a referrer that is itself a repository
      for (const ref of refs) {
        if (typeof ref !== 'string') continue;
        const referrer = nodeById.get(ref);
        const cats = referrer?.['_category'];
        if (Array.isArray(cats) && cats.includes('repository')) {
          if (ref !== selfId) return { ...node, _parent: ref };
        }
      }

      // Priority 2: referrer is a CatalogRecord → follow its foaf:primaryTopic
      // when it's a real URI string (i.e., not a blank node that got embedded).
      for (const ref of refs) {
        if (typeof ref !== 'string') continue;
        const referrer = nodeById.get(ref);
        if (!referrer || !hasCatalogRecordType(referrer)) continue;
        const primaryTopic = referrer['foaf:primaryTopic'];
        if (typeof primaryTopic === 'string' && primaryTopic !== selfId) {
          return setParent(primaryTopic);
        }
      }

      // Priority 3: extract the repo IRI from the harvester URI scheme
      // `eden://harvester/<source>/<repo-IRI>`. Works even when
      // foaf:primaryTopic is a blank node (post-embed). Skip when the
      // extracted IRI is this node's own @id (repos referenced by their
      // own CatalogRecord wrappers).
      const HARVESTER_URI = /^eden:\/\/harvester\/[^/]+\/(.+)$/;
      for (const ref of refs) {
        if (typeof ref !== 'string') continue;
        const m = ref.match(HARVESTER_URI);
        if (m && m[1] !== selfId) {
          return { ...node, _parent: m[1] };
        }
      }

      return node;
    });
  }

  // Faceted search needs a stable, canonical category keyword on every doc.
  // Rules are @type-driven (the only reliable signal the harvester emits),
  // with dct:type as a refinement on primary-topic nodes whose @type is
  // uniformly ['dcat:Catalog','foaf:Project'] regardless of whether the
  // underlying thing is a repository, standard, or policy.
  //
  // Always an array to keep dynamic ES mapping stable across docs.
  private deriveCategory(nodes: JsonLdNode[]): JsonLdNode[] {
    return nodes.map((node) => ({
      ...node,
      _category: this.categoryFor(node),
    }));
  }

  private categoryFor(node: JsonLdNode): string[] {
    const types = new Set(this.getNodeTypes(node));
    const has = (...candidates: string[]) =>
      candidates.some((c) => types.has(c));

    if (has('dcat:DataService', 'http://www.w3.org/ns/dcat#DataService')) {
      return ['data-service'];
    }
    if (has('dct:Policy', 'http://purl.org/dc/terms/Policy')) {
      return ['policy'];
    }
    if (has('dct:Standard', 'http://purl.org/dc/terms/Standard')) {
      return ['standard'];
    }
    if (
      has(
        'dcat:CatalogRecord',
        'http://www.w3.org/ns/dcat#CatalogRecord',
        'prov:Activity',
        'http://www.w3.org/ns/prov#Activity',
        'prov:SoftwareAgent',
        'http://www.w3.org/ns/prov#SoftwareAgent',
        'prov:Entity',
        'http://www.w3.org/ns/prov#Entity',
      )
    ) {
      return ['_internal'];
    }
    if (
      has(
        'dcat:Catalog',
        'http://www.w3.org/ns/dcat#Catalog',
        'foaf:Project',
        'http://xmlns.com/foaf/0.1/Project',
      )
    ) {
      const refined = this.refineByDctType(node);
      return [refined ?? 'repository'];
    }
    return ['other'];
  }

  // Primary-topic @type is uniform (dcat:Catalog + foaf:Project); the real
  // distinction lives in dct:type. FAIRsharing records use fairsharing:standard,
  // fairsharing:policy, fairsharing:repository; re3data uses r3d:Repository;
  // embedded JSON-LD carries DataCatalog/schema types. Substring-match is
  // intentional — the vocab is uncontrolled.
  private refineByDctType(node: JsonLdNode): string | null {
    const dctType = node['dct:type'];
    const values = Array.isArray(dctType) ? dctType : [dctType];
    for (const v of values) {
      if (typeof v !== 'string') continue;
      if (/standard/i.test(v)) return 'standard';
      if (/polic/i.test(v)) return 'policy';
    }
    return null;
  }

  // Top-level @type is promoted to a string[] so dynamic ES mapping
  // cannot flip between scalar and array across docs. Embedded blank-node
  // @types are left as-is (they are not separately indexed).
  private normalizeTypeArrays(nodes: JsonLdNode[]): JsonLdNode[] {
    return nodes.map((node) => {
      const type = node['@type'];
      if (typeof type === 'string') {
        return { ...node, '@type': [type] };
      }
      return node;
    });
  }

  // After flattening, URI references are collapsed to plain strings. Scan each
  // document for string values that match another document's @id and add a
  // synthetic _referencedBy array to the referenced document.
  private addBackReferences(nodes: JsonLdNode[]): JsonLdNode[] {
    const docIds = new Set(nodes.map((n) => n['@id'] as string));
    const backRefs = new Map<string, string[]>();

    for (const node of nodes) {
      const parentId = node['@id'] as string;
      this.collectUriReferences(node, docIds, parentId, backRefs);
    }

    return nodes.map((node) => {
      const id = node['@id'] as string;
      const refs = backRefs.get(id);
      return refs?.length ? { ...node, _referencedBy: refs } : node;
    });
  }

  private collectUriReferences(
    value: unknown,
    docIds: Set<string>,
    parentId: string,
    backRefs: Map<string, string[]>,
  ): void {
    if (typeof value === 'string') {
      if (value !== parentId && docIds.has(value)) {
        const existing = backRefs.get(value) ?? [];
        if (!existing.includes(parentId)) {
          backRefs.set(value, [...existing, parentId]);
        }
      }
      return;
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        this.collectUriReferences(item, docIds, parentId, backRefs);
      }
      return;
    }
    if (typeof value === 'object' && value !== null) {
      for (const v of Object.values(value)) {
        this.collectUriReferences(v, docIds, parentId, backRefs);
      }
    }
  }

  // Build a synthetic _policy field on documents that reference Policy-type
  // nodes via dct:conformsTo. The field contains the human-readable dct:title
  // of each referenced policy, omitting unresolvable URIs (e.g. protocol specs).
  private addPolicyLabels(nodes: JsonLdNode[]): JsonLdNode[] {
    const policyTypes = new Set([
      'dct:Policy',
      'http://purl.org/dc/terms/Policy',
    ]);

    const policyTitleMap = new Map<string, string>();
    for (const node of nodes) {
      const types = this.getNodeTypes(node);
      if (!types.some((t) => policyTypes.has(t))) continue;
      const id = node['@id'] as string;
      const title = node['dct:title'];
      if (id && typeof title === 'string') {
        policyTitleMap.set(id, title);
      }
    }

    return nodes.map((node) => {
      const conformsTo = node['dct:conformsTo'];
      if (!conformsTo) return node;

      const values = Array.isArray(conformsTo) ? conformsTo : [conformsTo];
      const labels = values
        .filter(
          (val): val is string =>
            typeof val === 'string' && policyTitleMap.has(val),
        )
        .map((val) => policyTitleMap.get(val)!);

      if (labels.length === 0) return node;
      // Always an array: scalar↔array drift in dynamic mapping silently
      // drops subsequent docs on mapper_parsing_exception.
      return { ...node, _policy: labels };
    });
  }

  private getNodeTypes(node: JsonLdNode): string[] {
    const type = node['@type'];
    if (Array.isArray(type))
      return type.filter((t): t is string => typeof t === 'string');
    if (typeof type === 'string') return [type];
    return [];
  }

  // Partition nodes into URI nodes (real entities) and blank nodes (anonymous),
  // then inline each blank node into the parent that references it.
  private embedBlankNodes(nodes: JsonLdNode[]): JsonLdNode[] {
    const blankNodeMap = new Map<string, JsonLdNode>();
    const uriNodes: JsonLdNode[] = [];

    for (const node of nodes) {
      const id = node['@id'] as string | undefined;
      if (id && id.startsWith('_:')) {
        blankNodeMap.set(id, node);
      } else {
        uriNodes.push(node);
      }
    }

    return uriNodes.map((node) =>
      this.resolveBlankNodeRefs(node, blankNodeMap),
    );
  }

  private resolveBlankNodeRefs(
    node: JsonLdNode,
    blankNodeMap: Map<string, JsonLdNode>,
  ): JsonLdNode {
    const resolved: JsonLdNode = {};

    for (const [key, value] of Object.entries(node)) {
      resolved[key] = this.resolveValue(value, blankNodeMap);
    }

    return resolved;
  }

  private resolveValue(
    value: unknown,
    blankNodeMap: Map<string, JsonLdNode>,
  ): unknown {
    if (Array.isArray(value)) {
      return value.map((item) => this.resolveValue(item, blankNodeMap));
    }

    if (this.isBlankNodeRef(value)) {
      const blankNode = blankNodeMap.get(value['@id']);
      if (blankNode) {
        const embedded = { ...blankNode };
        delete embedded['@id'];
        return this.resolveBlankNodeRefs(embedded, blankNodeMap);
      }
    }

    if (this.isUriRef(value)) {
      return value['@id'];
    }

    return value;
  }

  // A blank node reference is a single-key object like {"@id": "_:b0"} — the
  // flattened form of an anonymous node that should be resolved to its full object.
  private isBlankNodeRef(value: unknown): value is { '@id': string } {
    return (
      typeof value === 'object' &&
      value !== null &&
      Object.keys(value).length === 1 &&
      '@id' in value &&
      typeof (value as Record<string, unknown>)['@id'] === 'string' &&
      ((value as Record<string, unknown>)['@id'] as string).startsWith('_:')
    );
  }

  // A URI reference is a single-key object like {"@id": "https://example.org/resource"}.
  // These are collapsed to plain URI strings so that ES field types stay consistent —
  // without this, the same property can be a string in one doc and an object in another,
  // which causes ES dynamic mapping conflicts.
  private isUriRef(value: unknown): value is { '@id': string } {
    return (
      typeof value === 'object' &&
      value !== null &&
      Object.keys(value).length === 1 &&
      '@id' in value &&
      typeof (value as Record<string, unknown>)['@id'] === 'string' &&
      !((value as Record<string, unknown>)['@id'] as string).startsWith('_:')
    );
  }
}
