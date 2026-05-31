import { getConfiguredBackend } from "@/lib/backend/config"
import type { SyncStatusRepository } from "@/lib/sync/repository"
import { SupabaseSyncStatusRepository } from "@/lib/sync/supabase-status"
import { UnsupportedSyncStatusRepository } from "@/lib/sync/unsupported-status"

export function createSyncStatusRepository(): SyncStatusRepository {
  switch (getConfiguredBackend()) {
    case "browser":
      return new UnsupportedSyncStatusRepository()
    case "supabase":
    default:
      return new SupabaseSyncStatusRepository()
  }
}

