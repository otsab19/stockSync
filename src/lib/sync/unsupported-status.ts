import type { SyncStatusRepository } from "@/lib/sync/repository"
import type { SyncStatusApiResponse } from "@/types/sync"

export class UnsupportedSyncStatusRepository implements SyncStatusRepository {
  async getStatus(): Promise<SyncStatusApiResponse> {
    return {
      status: "disabled",
      backend: "browser",
      supportsScheduledSync: false,
      connections: [],
      recentRuns: [],
      message:
        "Browser mode supports in-app broker syncing while the app is open, but periodic broker sync and closed-app notifications require the server-backed Supabase mode.",
    }
  }
}

