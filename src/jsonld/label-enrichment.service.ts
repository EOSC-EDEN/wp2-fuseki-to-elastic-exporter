import { Injectable } from '@nestjs/common';

type JsonLdNode = Record<string, unknown>;

/**
 * Temporary policy label mapping — will be replaced by the harmonizer.
 *
 * Maps policy @type IRIs (both prefixed and expanded forms) to
 * human-readable labels. Keys that match the generic "Policy" type
 * are used as a fallback when no more specific type is found.
 */
const POLICY_LABELS: Record<string, string> = {
  'dct:Policy': 'Policy',
  'http://purl.org/dc/terms/Policy': 'Policy',
  'premis:PreservationPolicy': 'Preservation Policy',
  'ex:DepositionPolicy': 'Deposition Policy',
  'ex:SustainabilityPolicy': 'Sustainability Policy',
};

const GENERIC_POLICY_TYPES = new Set([
  'dct:Policy',
  'http://purl.org/dc/terms/Policy',
]);

@Injectable()
export class LabelEnrichmentService {
  enrichLabels(nodes: JsonLdNode[]): JsonLdNode[] {
    return nodes.map((node) => this.enrichNode(node));
  }

  private enrichNode(node: JsonLdNode): JsonLdNode {
    if (node['rdfs:label'] != null) return node;

    const types = this.getTypes(node);
    const label = this.findBestLabel(types, node);
    if (!label) return node;

    return { ...node, 'rdfs:label': label };
  }

  private getTypes(node: JsonLdNode): string[] {
    const type = node['@type'];
    if (Array.isArray(type))
      return type.filter((t): t is string => typeof t === 'string');
    if (typeof type === 'string') return [type];
    return [];
  }

  private findBestLabel(types: string[], node: JsonLdNode): string | null {
    // For policy types: prefer dct:title over generic type label
    const isPolicy = types.some((t) => t in POLICY_LABELS);
    if (isPolicy && typeof node['dct:title'] === 'string') {
      return node['dct:title'];
    }

    // Prefer specific types over generic dct:Policy
    const specific = types.find(
      (t) => t in POLICY_LABELS && !GENERIC_POLICY_TYPES.has(t),
    );
    if (specific) return POLICY_LABELS[specific];

    // Fall back to generic policy label
    const generic = types.find((t) => GENERIC_POLICY_TYPES.has(t));
    if (generic) return POLICY_LABELS[generic];

    return null;
  }
}
