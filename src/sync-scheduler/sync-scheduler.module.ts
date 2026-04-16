import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { GraphSyncModule } from '../graph-sync/graph-sync.module';
import { SyncQueueModule } from '../sync-queue/sync-queue.module';
import { FusekiModule } from '../fuseki/fuseki.module';
import { ReindexModule } from '../reindex/reindex.module';
import { SyncSchedulerService } from './sync-scheduler.service';

@Module({
  imports: [
    ConfigModule,
    GraphSyncModule,
    SyncQueueModule,
    FusekiModule,
    ReindexModule,
  ],
  providers: [SyncSchedulerService],
  exports: [SyncSchedulerService],
})
export class SyncSchedulerModule {}
