import type { SyncStateModel } from '../../generated/prisma/models/SyncState';
import { IsString, IsDate, IsOptional } from 'class-validator';

export class SyncState implements SyncStateModel {
  @IsString()
  id: string;

  @IsDate()
  lastSyncedAt: Date;

  @IsOptional()
  @IsString()
  activeIndexName: string | null;
}
