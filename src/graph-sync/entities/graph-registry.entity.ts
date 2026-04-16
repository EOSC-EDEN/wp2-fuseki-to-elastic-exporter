import type { GraphRegistryModel } from '../../generated/prisma/models/GraphRegistry';
import {
  IsString,
  IsArray,
  IsInt,
  IsDate,
  IsUUID,
  IsOptional,
} from 'class-validator';

export class GraphRegistry implements GraphRegistryModel {
  @IsUUID()
  id: string;

  @IsString()
  graphUri: string;

  @IsOptional()
  @IsString()
  contentHash: string | null;

  @IsArray()
  @IsString({ each: true })
  documentIds: string[];

  @IsInt()
  documentCount: number;

  @IsDate()
  lastSyncedAt: Date;

  @IsDate()
  createdAt: Date;
}
