import { normalizeRepositoryIri } from '../jsonld/repository-iri';
import type { KbProfile, KbProperty, KnowledgeBase } from './knowledge-base';

type JsonLdNode = Record<string, unknown>;

const hasValue = (value: unknown): boolean =>
  Array.isArray(value)
    ? value.some(hasValue)
    : value !== undefined && value !== null && value !== '';

// A repository conforms when every mandatory property's attribute is present
// and the share of present properties reaches the profile's minimum coverage.
// A property without an attribute counts in the total and is never present.
export const conforms = (
  present: ReadonlySet<string>,
  profile: KbProfile,
): boolean => {
  const isPresent = ({ attribute }: KbProperty): boolean =>
    attribute !== null && present.has(attribute);
  const { properties, minimumCoverage } = profile;
  return (
    properties.length > 0 &&
    properties.every((p) => !p.mandatory || isPresent(p)) &&
    properties.filter(isPresent).length / properties.length >= minimumCoverage
  );
};

const sortedLabels = (labels: Iterable<string>): string[] =>
  [...new Set(labels)].sort();

// Adds _hasAttribute and _conformsTo, as labels, to repository nodes, and
// leaves out a field that would be empty. A repository conforms to the
// profiles its attributes meet and to those the KB assigns to it by hand.
export const assignProfiles = (
  nodes: JsonLdNode[],
  kb: KnowledgeBase,
): JsonLdNode[] =>
  nodes.map((node) => {
    const categories = node['_category'];
    if (!Array.isArray(categories) || !categories.includes('repository')) {
      return node;
    }

    const present = new Set(
      [...kb.attributeLabels.keys()].filter((attribute) =>
        hasValue(node[attribute]),
      ),
    );
    const id = node['@id'];
    const assigned =
      typeof id === 'string'
        ? (kb.memberships.get(normalizeRepositoryIri(id)) ?? [])
        : [];

    const fields = Object.entries({
      _hasAttribute: sortedLabels(
        [...present].map((attribute) => kb.attributeLabels.get(attribute)!),
      ),
      _conformsTo: sortedLabels(
        kb.profiles
          .filter((p) => assigned.includes(p.iri) || conforms(present, p))
          .map((p) => p.label),
      ),
    }).filter(([, labels]) => labels.length > 0);

    return fields.length > 0
      ? { ...node, ...Object.fromEntries(fields) }
      : node;
  });
