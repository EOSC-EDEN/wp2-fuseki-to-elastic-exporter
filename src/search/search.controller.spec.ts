import { TestBed } from '@suites/unit';
import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';
import { ELASTICSEARCH_CONFIG_KEY } from '../config';

describe('SearchController', () => {
  let controller: SearchController;
  let searchService: SearchService;

  beforeEach(async () => {
    const { unit, unitRef } = await TestBed.solitary(SearchController)
      .mock(ConfigService)
      .impl(() => ({
        get: jest.fn().mockImplementation((key: symbol) => {
          if (key === ELASTICSEARCH_CONFIG_KEY) {
            return { ELASTICSEARCH_ALIAS: 'eden-test' };
          }
        }),
      }))
      .compile();

    controller = unit;
    searchService = unitRef.get(SearchService) as unknown as SearchService;
  });

  describe('search', () => {
    it('should forward the body to the search service', async () => {
      const body = { query: { match_all: {} } };
      const mockResult = { hits: { hits: [] } };
      (searchService.search as jest.Mock).mockResolvedValueOnce(mockResult);

      const result = await controller.search('eden-test', body);

      expect(searchService.search).toHaveBeenCalledWith('eden-test', body);
      expect(result).toBe(mockResult);
    });
  });

  describe('index pinning', () => {
    it('should search the configured alias regardless of the path segment', async () => {
      await controller.search('some-other-index', { size: 10 });

      expect(searchService.search).toHaveBeenCalledWith('eden-test', {
        size: 10,
      });
    });

    it('should read the source from the configured alias', async () => {
      const mockSource = { title: 'Test' };
      (searchService.getSource as jest.Mock).mockResolvedValueOnce(mockSource);

      const result = await controller.getSource('some-other-index', 'doc-1');

      expect(searchService.getSource).toHaveBeenCalledWith(
        'eden-test',
        'doc-1',
      );
      expect(result).toBe(mockSource);
    });
  });

  describe('query body limits', () => {
    it('should reject a size above the maximum', async () => {
      await expect(controller.search('eden', { size: 5000 })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should reject unknown top-level keys', async () => {
      await expect(
        controller.search('eden', { script_fields: {} }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should not reach Elasticsearch when the body is rejected', async () => {
      await expect(
        controller.search('eden', { script_fields: {} }),
      ).rejects.toThrow(BadRequestException);

      expect(searchService.search).not.toHaveBeenCalled();
    });

    it('should accept the shape the frontend sends', async () => {
      const body = {
        query: {
          bool: { must_not: [{ term: { '_category.keyword': '_internal' } }] },
        },
        aggs: {
          '_category.keyword': { terms: { field: '_category.keyword' } },
        },
        from: 0,
        size: 20,
        sort: [{ 'dct:title.keyword': 'asc' }],
        highlight: {},
        _source: ['@id'],
        track_total_hits: true,
      };
      (searchService.search as jest.Mock).mockResolvedValueOnce({});

      await expect(controller.search('eden', body)).resolves.toBeDefined();
    });

    it('should accept an empty body', async () => {
      (searchService.search as jest.Mock).mockResolvedValueOnce({});

      await expect(controller.search('eden', {})).resolves.toBeDefined();
    });
  });
});
