-- Remove lastPatchVersion from SyncState
ALTER TABLE "SyncState" DROP COLUMN IF EXISTS "lastPatchVersion";

-- Add contentHash to GraphRegistry
ALTER TABLE "GraphRegistry" ADD COLUMN IF NOT EXISTS "contentHash" TEXT;
