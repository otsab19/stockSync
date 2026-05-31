export type BrokerConnectionSourceType = "manual_csv" | "broker_api"
export type BrokerConnectionSyncMode = "manual" | "scheduled"
export type BrokerConnectionSyncStatus = "never_synced" | "ready" | "running" | "succeeded" | "failed"
export type SyncRunTrigger = "manual" | "scheduled"
export type SyncRunStatus = "running" | "succeeded" | "failed"

export type BrokerConnectionSummary = {
  id: string
  broker: "t212" | "etoro"
  sourceType: BrokerConnectionSourceType
  syncMode: BrokerConnectionSyncMode
  syncStatus: BrokerConnectionSyncStatus
  isEnabled: boolean
  lastSyncedAt: string | null
  lastError: string | null
}

export type SyncRunSummary = {
  id: string
  connectionId: string | null
  broker: "t212" | "etoro"
  trigger: SyncRunTrigger
  sourceType: BrokerConnectionSourceType
  status: SyncRunStatus
  startedAt: string
  finishedAt: string | null
  positionsImported: number
  errorMessage: string | null
}

export type SyncStatusApiSuccess = {
  status: "ok"
  backend: "supabase"
  supportsScheduledSync: true
  connections: BrokerConnectionSummary[]
  recentRuns: SyncRunSummary[]
  message?: string
}

export type SyncStatusApiDisabled = {
  status: "disabled"
  backend: "browser"
  supportsScheduledSync: false
  connections: []
  recentRuns: []
  message: string
}

export type SyncStatusApiFailure = {
  status: "setup_required" | "unauthorized" | "error"
  backend: "supabase"
  supportsScheduledSync: true
  connections: []
  recentRuns: []
  message: string
}

export type SyncStatusApiResponse = SyncStatusApiSuccess | SyncStatusApiDisabled | SyncStatusApiFailure

