import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { KbModule } from '../kb/kb.module';
import { JsonldProcessingService } from './jsonld-processing.service';
import { LabelEnrichmentService } from './label-enrichment.service';
import { QualityMeasurementsService } from './quality-measurements.service';

@Module({
  imports: [ConfigModule, KbModule],
  providers: [
    JsonldProcessingService,
    LabelEnrichmentService,
    QualityMeasurementsService,
  ],
  exports: [JsonldProcessingService],
})
export class JsonldModule {}
