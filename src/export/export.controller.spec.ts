import { TestBed } from '@suites/unit';
import { ExportController } from './export.controller';
import { ReindexService } from '../reindex/reindex.service';

describe('ExportController', () => {
  let controller: ExportController;
  let reindexService: ReindexService;

  beforeEach(async () => {
    const { unit, unitRef } =
      await TestBed.solitary(ExportController).compile();

    controller = unit;
    reindexService = unitRef.get(ReindexService) as unknown as ReindexService;
  });

  describe('triggerExport', () => {
    it('should call reindexAll and return a success message', async () => {
      (reindexService.reindexAll as jest.Mock).mockResolvedValueOnce({
        graphs: 92,
        indexed: 450,
        rejected: 0,
      });

      const result = await controller.triggerExport();

      expect(reindexService.reindexAll).toHaveBeenCalled();
      expect(result).toEqual({
        message: 'Reindex completed successfully',
        graphs: 92,
        indexed: 450,
        rejected: 0,
      });
    });

    it('should report a partial reindex when documents were rejected', async () => {
      (reindexService.reindexAll as jest.Mock).mockResolvedValueOnce({
        graphs: 92,
        indexed: 400,
        rejected: 50,
      });

      const result = await controller.triggerExport();

      expect(result.message).toBe(
        'Reindex completed with 50 rejected documents',
      );
      expect(result.rejected).toBe(50);
    });

    it('should propagate errors from reindexAll', async () => {
      (reindexService.reindexAll as jest.Mock).mockRejectedValueOnce(
        new Error('Fuseki is down'),
      );

      await expect(controller.triggerExport()).rejects.toThrow(
        'Fuseki is down',
      );
    });
  });
});
