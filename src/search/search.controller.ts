import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SearchService } from './search.service';
import { ELASTICSEARCH_CONFIG_KEY, type ElasticsearchConfig } from '../config';

// The frontend composes Elasticsearch queries in the browser, so this endpoint
// has to accept a query body. It does not have to accept any body against any
// index. Search stays anonymous, because a public registry needs public search;
// what is removed is the caller's choice of index and an unbounded query.
const ALLOWED_KEYS = new Set([
  'query',
  'aggs',
  'aggregations',
  'from',
  'size',
  'sort',
  'highlight',
  '_source',
  'track_total_hits',
  'post_filter',
]);

const MAX_SIZE = 1000;

@Controller(':index')
export class SearchController {
  private readonly alias: string;

  constructor(
    private readonly searchService: SearchService,
    private readonly configService: ConfigService,
  ) {
    const esConfig = this.configService.get<ElasticsearchConfig>(
      ELASTICSEARCH_CONFIG_KEY,
    );
    this.alias = esConfig!.ELASTICSEARCH_ALIAS;
  }

  // The path segment is kept so existing client URLs keep working, but the
  // index is resolved from configuration and the segment is ignored.
  @Post('_search')
  async search(
    @Param('index') _index: string,
    @Body() body: Record<string, unknown>,
  ) {
    this.assertAllowedBody(body);
    return this.searchService.search(this.alias, body);
  }

  @Get('_source/:id')
  async getSource(@Param('index') _index: string, @Param('id') id: string) {
    return this.searchService.getSource(this.alias, id);
  }

  private assertAllowedBody(body: Record<string, unknown>): void {
    for (const key of Object.keys(body ?? {})) {
      if (!ALLOWED_KEYS.has(key)) {
        throw new BadRequestException(`Unsupported search parameter "${key}"`);
      }
    }

    const size = body?.['size'];
    if (typeof size === 'number' && size > MAX_SIZE) {
      throw new BadRequestException(`size must not exceed ${MAX_SIZE}`);
    }
  }
}
