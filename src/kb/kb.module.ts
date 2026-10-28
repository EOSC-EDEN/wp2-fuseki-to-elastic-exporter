import { Module } from '@nestjs/common';
import { FusekiModule } from '../fuseki/fuseki.module';
import { KbService } from './kb.service';

@Module({
  imports: [FusekiModule],
  providers: [KbService],
  exports: [KbService],
})
export class KbModule {}
