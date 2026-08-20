import { Controller, Get, UseGuards } from '@nestjs/common';
import { AuthTokenGuard } from '../auth/auth-token.guard';
import { ReindexService } from '../reindex/reindex.service';

@Controller('export')
@UseGuards(AuthTokenGuard)
export class ExportController {
  constructor(private readonly reindexService: ReindexService) {}

  // Reports rejected documents rather than always claiming success: rejected
  // bulk writes are logged as warnings and are otherwise invisible to a caller.
  @Get()
  async triggerExport(): Promise<{
    message: string;
    graphs: number;
    indexed: number;
    rejected: number;
  }> {
    const result = await this.reindexService.reindexAll();

    return {
      message:
        result.rejected > 0
          ? `Reindex completed with ${result.rejected} rejected documents`
          : 'Reindex completed successfully',
      ...result,
    };
  }
}
