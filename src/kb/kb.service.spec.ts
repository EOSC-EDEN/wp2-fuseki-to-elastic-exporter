import { Logger } from '@nestjs/common';
import { TestBed } from '@suites/unit';
import { FusekiService } from '../fuseki/fuseki.service';
import { KbService } from './kb.service';
import { EMPTY_KNOWLEDGE_BASE } from './knowledge-base';

const FIDELIS = 'https://eden-fidelis.eu/network-member';
const TRSP = 'https://w3id.org/trsp/';

const binding = (row: Record<string, string>) =>
  Object.fromEntries(
    Object.entries(row).map(([key, value]) => [key, { value }]),
  );

const PROFILE_ROWS: Array<Record<string, string>> = [
  {
    profile: FIDELIS,
    label: 'FIDELIS network',
    coverage: '0.6',
    property: `${FIDELIS}#name`,
    attribute: `${TRSP}att.64DA341B5F`,
    mandatory: 'true',
  },
  {
    profile: FIDELIS,
    label: 'FIDELIS network',
    coverage: '0.6',
    property: `${FIDELIS}#other`,
  },
];
const LABEL_ROWS: Array<Record<string, string>> = [
  { attribute: `${TRSP}att.64DA341B5F`, label: 'Repository Name' },
];
const MEMBERSHIP_ROWS: Array<Record<string, string>> = [
  { repository: 'https://pangaea.de/', profile: FIDELIS },
];

describe('KbService', () => {
  let service: KbService;
  let fusekiService: FusekiService;

  beforeEach(async () => {
    const { unit, unitRef } = await TestBed.solitary(KbService).compile();
    service = unit;
    fusekiService = unitRef.get(FusekiService) as unknown as FusekiService;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('builds profiles, labels and memberships from Fuseki rows', async () => {
    (fusekiService.select as jest.Mock).mockImplementation((query: string) => {
      if (query.includes('edenkb:minimumCoverage')) {
        return Promise.resolve(PROFILE_ROWS.map(binding));
      }
      if (query.includes('eden://kb/memberships/')) {
        return Promise.resolve(MEMBERSHIP_ROWS.map(binding));
      }
      return Promise.resolve(LABEL_ROWS.map(binding));
    });

    const kb = await service.load();

    expect(kb.profiles).toEqual([
      {
        iri: FIDELIS,
        label: 'FIDELIS network',
        minimumCoverage: 0.6,
        properties: [
          { attribute: 'trsp:att.64DA341B5F', mandatory: true },
          { attribute: null, mandatory: false },
        ],
      },
    ]);
    expect(kb.attributeLabels.get('trsp:att.64DA341B5F')).toBe(
      'Repository Name',
    );
    expect(kb.memberships.get('https://pangaea.de')).toEqual([FIDELIS]);
  });

  it('returns the empty knowledge base and warns when Fuseki fails', async () => {
    const warn = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    (fusekiService.select as jest.Mock).mockRejectedValue(
      new Error('connect ECONNREFUSED'),
    );

    await expect(service.load()).resolves.toBe(EMPTY_KNOWLEDGE_BASE);
    await expect(service.load()).resolves.toBe(EMPTY_KNOWLEDGE_BASE);
    expect(warn).toHaveBeenCalledTimes(1);
  });
});
