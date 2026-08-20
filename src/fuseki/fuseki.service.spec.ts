import { TestBed } from '@suites/unit';
import { ConfigService } from '@nestjs/config';
import { FusekiService } from './fuseki.service';
import { FUSEKI_CONFIG_KEY } from '../config';

describe('FusekiService', () => {
  let service: FusekiService;

  beforeEach(async () => {
    const { unit } = await TestBed.solitary(FusekiService)
      .mock(ConfigService)
      .impl(() => ({
        get: jest.fn().mockImplementation((key: symbol) => {
          if (key === FUSEKI_CONFIG_KEY) {
            return { FUSEKI_ENDPOINT: 'http://fuseki:3030/eden' };
          }
        }),
      }))
      .compile();

    service = unit;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('graphFingerprints', () => {
    it('should return one fingerprint per graph from a single query', async () => {
      const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        json: async () => ({
          results: {
            bindings: [
              { g: { value: 'eden://a' }, triples: { value: '12' } },
              { g: { value: 'eden://b' }, triples: { value: '7' } },
            ],
          },
        }),
      } as unknown as Response);

      const result = await service.graphFingerprints();

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(result.get('eden://a')).toBe('12');
      expect(result.get('eden://b')).toBe('7');
    });

    it('should throw when Fuseki responds with an error', async () => {
      jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: false,
        status: 503,
        statusText: 'Service Unavailable',
      } as unknown as Response);

      await expect(service.graphFingerprints()).rejects.toThrow(
        'Failed to fetch graph fingerprints: 503 Service Unavailable',
      );
    });
  });
});
