import { Module } from '@nestjs/common';
import { JsonldProcessingService } from './jsonld-processing.service';
import { LabelEnrichmentService } from './label-enrichment.service';

@Module({
  providers: [JsonldProcessingService, LabelEnrichmentService],
  exports: [JsonldProcessingService],
})
export class JsonldModule {}
