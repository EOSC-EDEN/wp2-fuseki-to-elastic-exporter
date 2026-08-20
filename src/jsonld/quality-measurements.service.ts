import { Injectable } from '@nestjs/common';

type JsonLdNode = Record<string, unknown>;

const MEASUREMENT_TYPES = new Set([
  'dqv:QualityMeasurement',
  'http://www.w3.org/ns/dqv#QualityMeasurement',
]);

const METRIC_TYPES = new Set(['dqv:Metric', 'http://www.w3.org/ns/dqv#Metric']);

const VALIDATOR_RUN_PREFIX = 'eden://validator/run/';

// Metric IRI to the flat field it becomes on the referencing document, plus how
// its typed literal is converted. Elasticsearch cannot range-filter or sort a
// value that arrives as a string inside a nested object, which is what the raw
// DQV shape produces.
const METRIC_FIELDS: Record<
  string,
  { field: string; convert: (raw: string) => boolean | number }
> = {
  'eden://validator/metric/endpointAvailability': {
    field: '_endpointAvailability',
    convert: (raw) => raw === 'true',
  },
  'eden://validator/metric/validationScore': {
    field: '_validationScore',
    convert: (raw) => Number(raw),
  },
};

/**
 * Resolves each service's quality measurements into flat, typed fields and
 * removes the DQV and PROV nodes from the projection.
 *
 * The measurements arrive as separate documents because they carry real IRIs,
 * so blank-node embedding never inlines them and references collapse to opaque
 * strings. They also cannot be indexed as they stand: `prov:wasGeneratedBy` is
 * an inlined object on the CatalogRecord and a plain IRI string here, so
 * Elasticsearch maps the field as an object and rejects every measurement.
 * Fuseki remains the system of record for the full DQV and PROV structure.
 */
@Injectable()
export class QualityMeasurementsService {
  fold(nodes: JsonLdNode[]): JsonLdNode[] {
    const measurements = new Map<string, JsonLdNode>();
    for (const node of nodes) {
      if (this.hasType(node, MEASUREMENT_TYPES)) {
        measurements.set(node['@id'] as string, node);
      }
    }

    const folded = nodes.map((node) => this.foldNode(node, measurements));

    return folded.filter((node) => !this.isDroppable(node));
  }

  private foldNode(
    node: JsonLdNode,
    measurements: Map<string, JsonLdNode>,
  ): JsonLdNode {
    const refs = node['dqv:hasQualityMeasurement'];
    if (refs === undefined) return node;

    const values = Array.isArray(refs) ? refs : [refs];
    const result: JsonLdNode = { ...node };
    delete result['dqv:hasQualityMeasurement'];

    for (const ref of values) {
      if (typeof ref !== 'string') continue;
      const measurement = measurements.get(ref);
      if (!measurement) continue;

      const metric = measurement['dqv:isMeasurementOf'];
      if (typeof metric !== 'string') continue;
      const mapping = METRIC_FIELDS[metric];
      if (!mapping) continue;

      const raw = this.literalValue(measurement['dqv:value']);
      if (raw === null) continue;
      result[mapping.field] = mapping.convert(raw);

      const generatedAt = this.literalValue(
        measurement['prov:generatedAtTime'],
      );
      if (generatedAt !== null) {
        const parsed = new Date(generatedAt);
        if (!Number.isNaN(parsed.getTime())) {
          result['_validatedAt'] = parsed.toISOString();
        }
      }
    }

    return result;
  }

  // A typed literal survives flattening as { "@value": ..., "@type": ... }.
  private literalValue(value: unknown): string | null {
    if (typeof value === 'string') return value;
    if (
      typeof value === 'object' &&
      value !== null &&
      '@value' in value &&
      typeof (value as Record<string, unknown>)['@value'] === 'string'
    ) {
      return (value as Record<string, unknown>)['@value'] as string;
    }
    return null;
  }

  private isDroppable(node: JsonLdNode): boolean {
    if (this.hasType(node, MEASUREMENT_TYPES)) return true;
    if (this.hasType(node, METRIC_TYPES)) return true;

    const id = node['@id'];
    return typeof id === 'string' && id.startsWith(VALIDATOR_RUN_PREFIX);
  }

  private hasType(node: JsonLdNode, candidates: Set<string>): boolean {
    const type = node['@type'];
    const types = Array.isArray(type) ? type : [type];
    return types.some((t) => typeof t === 'string' && candidates.has(t));
  }
}
