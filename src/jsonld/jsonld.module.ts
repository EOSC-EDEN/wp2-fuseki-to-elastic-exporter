import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JsonldProcessingService } from './jsonld-processing.service';
import { LabelEnrichmentService } from './label-enrichment.service';
import { QualityMeasurementsService } from './quality-measurements.service';

@Module({
  imports: [ConfigModule],
  providers: [
    JsonldProcessingService,
    LabelEnrichmentService,
    QualityMeasurementsService,
  ],
  exports: [JsonldProcessingService],
})
export class JsonldModule {}
