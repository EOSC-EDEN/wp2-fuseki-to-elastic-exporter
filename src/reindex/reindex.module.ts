import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { FusekiModule } from '../fuseki/fuseki.module';
import { JsonldModule } from '../jsonld/jsonld.module';
import { ElasticsearchIndexModule } from '../elasticsearch/elasticsearch-index.module';
import { GraphSyncModule } from '../graph-sync/graph-sync.module';
import { ReindexService } from './reindex.service';

@Module({
  imports: [
    ConfigModule,
    FusekiModule,
    JsonldModule,
    ElasticsearchIndexModule,
    GraphSyncModule,
  ],
  providers: [ReindexService],
  exports: [ReindexService],
})
export class ReindexModule {}
