import type { SyncStatusApiResponse } from "@/types/sync"

export interface SyncStatusRepository {
  getStatus(): Promise<SyncStatusApiResponse>
}

