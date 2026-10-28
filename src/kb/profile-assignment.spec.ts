import {
  EMPTY_KNOWLEDGE_BASE,
  type KbProfile,
  type KbProperty,
  type KnowledgeBase,
} from './knowledge-base';
import { assignProfiles, conforms } from './profile-assignment';

const property = (attribute: string | null, mandatory = false): KbProperty => ({
  attribute,
  mandatory,
});

const FIVE = [
  'trsp:att.A',
  'trsp:att.B',
  'trsp:att.C',
  'trsp:att.D',
  'trsp:att.E',
];

const profileOf = (properties: KbProperty[]): KbProfile => ({
  iri: 'trsp:profile.P',
  label: 'P',
  minimumCoverage: 0.6,
  properties,
});

describe('conforms', () => {
  it('conforms when coverage reaches the minimum', () => {
    const profile = profileOf(FIVE.map((attribute) => property(attribute)));
    expect(conforms(new Set(FIVE.slice(0, 3)), profile)).toBe(true);
    expect(conforms(new Set(FIVE.slice(0, 2)), profile)).toBe(false);
  });

  it('mandatory property wins over coverage', () => {
    const profile = profileOf(
      FIVE.map((attribute, i) => property(attribute, i === 4)),
    );
    expect(conforms(new Set(FIVE.slice(0, 4)), profile)).toBe(false);
  });
});

const FIDELIS = 'https://eden-fidelis.eu/network-member';

const KB: KnowledgeBase = {
  profiles: [
    {
      iri: FIDELIS,
      label: 'FIDELIS network',
      minimumCoverage: 0.6,
      properties: [
        property('trsp:att.A', true),
        property('trsp:att.B'),
        property(null),
      ],
    },
    {
      iri: 'trsp:profile.D',
      label: 'DRAWG',
      minimumCoverage: 0.6,
      properties: [property('trsp:att.C'), property('trsp:att.D')],
    },
  ],
  attributeLabels: new Map([
    ['trsp:att.A', 'Name'],
    ['trsp:att.B', 'Licence'],
    ['trsp:att.C', 'Country'],
    ['trsp:att.D', 'Language'],
  ]),
  memberships: new Map([['https://pangaea.de', [FIDELIS]]]),
};

const repository = (fields: Record<string, unknown> = {}) => ({
  '@id': 'https://example.org/',
  _category: ['repository'],
  ...fields,
});

describe('assignProfiles', () => {
  it('adds attribute and profile labels to repository nodes', () => {
    const [node] = assignProfiles(
      [
        repository({
          'trsp:att.A': ['Example'],
          'trsp:att.B': [
            { '@id': 'https://creativecommons.org/licenses/by/4.0/' },
          ],
        }),
      ],
      KB,
    );
    expect(node._hasAttribute).toEqual(['Licence', 'Name']);
    expect(node._conformsTo).toEqual(['FIDELIS network']);
  });

  it('leaves non-repository nodes unchanged', () => {
    const service = {
      '@id': 'https://pangaea.de/oai',
      _category: ['data-service'],
      'trsp:att.A': ['PANGAEA OAI-PMH'],
    };
    expect(assignProfiles([service], KB)).toEqual([service]);
  });

  it('adds hand-assigned profiles on normalized repository IRIs', () => {
    const [bare, qualified] = assignProfiles(
      [
        repository({ '@id': 'https://Pangaea.de/' }),
        repository({
          '@id': 'https://pangaea.de',
          'trsp:att.A': ['PANGAEA'],
          'trsp:att.B': ['CC-BY-4.0'],
        }),
      ],
      KB,
    );
    expect(bare._conformsTo).toEqual(['FIDELIS network']);
    expect(bare).not.toHaveProperty('_memberOf');
    expect(qualified._conformsTo).toEqual(['FIDELIS network']);
  });

  it('ignores empty attribute values', () => {
    const [node] = assignProfiles(
      [repository({ 'trsp:att.A': [], 'trsp:att.B': '' })],
      KB,
    );
    expect(node._hasAttribute).toBeUndefined();
    expect(node._conformsTo).toBeUndefined();
  });

  it('returns nodes unchanged for an empty knowledge base', () => {
    const nodes = [repository({ 'trsp:att.A': ['PANGAEA'] })];
    expect(assignProfiles(nodes, EMPTY_KNOWLEDGE_BASE)).toEqual(nodes);
  });
});
