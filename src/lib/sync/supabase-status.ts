import { createClient, getSupabaseSetupMessage } from "@/utils/supabase/server"
import type { SyncStatusRepository } from "@/lib/sync/repository"
import type { Database } from "@/types/supabase"
import type { BrokerConnectionSummary, SyncRunSummary, SyncStatusApiResponse } from "@/types/sync"

type BrokerConnectionRow = Database["public"]["Tables"]["broker_connections"]["Row"]
type SyncRunRow = Database["public"]["Tables"]["sync_runs"]["Row"]

const BROKER_CONNECTION_SELECT_LEGACY = "id, broker, source_type, sync_mode, sync_status, is_enabled, last_synced_at, last_error"
const BROKER_CONNECTION_SELECT_PHASE1 = `${BROKER_CONNECTION_SELECT_LEGACY}, last_positions_mapped, last_positions_stored, last_activity_imported`
const SYNC_RUN_SELECT_LEGACY = "id, connection_id, broker, trigger, source_type, status, positions_imported, error_message, started_at, finished_at"
const SYNC_RUN_SELECT_PHASE1 = `${SYNC_RUN_SELECT_LEGACY}, positions_mapped, activity_imported`

type BrokerConnectionQueryRow = Pick<
  BrokerConnectionRow,
  | "id"
  | "broker"
  | "source_type"
  | "sync_mode"
  | "sync_status"
  | "is_enabled"
  | "last_synced_at"
  | "last_error"
  | "last_positions_mapped"
  | "last_positions_stored"
  | "last_activity_imported"
>

type SyncRunQueryRow = Pick<
  SyncRunRow,
  | "id"
  | "connection_id"
  | "broker"
  | "trigger"
  | "source_type"
  | "status"
  | "positions_imported"
  | "positions_mapped"
  | "activity_imported"
  | "error_message"
  | "started_at"
  | "finished_at"
>

function mapConnection(row: BrokerConnectionQueryRow): BrokerConnectionSummary {
  return {
    id: row.id,
    broker: row.broker,
    sourceType: row.source_type,
    syncMode: row.sync_mode,
    syncStatus: row.sync_status,
    isEnabled: row.is_enabled,
    lastSyncedAt: row.last_synced_at,
    lastError: row.last_error,
    lastPositionsMapped: row.last_positions_mapped ?? null,
    lastPositionsStored: row.last_positions_stored ?? null,
    lastActivityImported: row.last_activity_imported ?? null,
  }
}

function mapRun(row: SyncRunQueryRow): SyncRunSummary {
  return {
    id: row.id,
    connectionId: row.connection_id,
    broker: row.broker,
    trigger: row.trigger,
    sourceType: row.source_type,
    status: row.status,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    positionsImported: row.positions_imported,
    positionsMapped: row.positions_mapped ?? row.positions_imported,
    activityImported: row.activity_imported ?? 0,
    errorMessage: row.error_message,
  }
}

function buildSyncStatusErrorMessage(connectionError: Error | null, runsError: Error | null) {
  const detail = connectionError?.message ?? runsError?.message ?? "Unknown Supabase error."
  const normalized = detail.toLowerCase()

  if (normalized.includes("does not exist") || normalized.includes("relation")) {
    return "The broker sync tables are not ready yet. Apply the Supabase migrations (at least the initial schema) so broker_connections and sync_runs exist."
  }

  if (normalized.includes("column")) {
    return "Broker sync tables are missing newer columns. Apply the Phase 1 migration (20260622120000_phase1_lot_positions_and_account_snapshots.sql) in Supabase."
  }

  return `Unable to load broker sync status from Supabase: ${detail}`
}

export class SupabaseSyncStatusRepository implements SyncStatusRepository {
  async getStatus(): Promise<SyncStatusApiResponse> {
    const supabase = await createClient()

    if (!supabase) {
      return {
        status: "setup_required",
        backend: "supabase",
        supportsScheduledSync: true,
        connections: [],
        recentRuns: [],
        message: getSupabaseSetupMessage(),
      }
    }

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return {
        status: "unauthorized",
        backend: "supabase",
        supportsScheduledSync: true,
        connections: [],
        recentRuns: [],
        message: "Sign in with Supabase to inspect broker connections and periodic sync status.",
      }
    }

    let connectionsResponse = await supabase
      .from("broker_connections")
      .select(BROKER_CONNECTION_SELECT_PHASE1)
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false }) as unknown as {
      data: BrokerConnectionQueryRow[] | null
      error: Error | null
    }

    if (connectionsResponse.error) {
      connectionsResponse = await supabase
        .from("broker_connections")
        .select(BROKER_CONNECTION_SELECT_LEGACY)
        .eq("user_id", user.id)
        .order("updated_at", { ascending: false }) as unknown as {
        data: BrokerConnectionQueryRow[] | null
        error: Error | null
      }
    }

    let runsResponse = await supabase
      .from("sync_runs")
      .select(SYNC_RUN_SELECT_PHASE1)
      .eq("user_id", user.id)
      .order("started_at", { ascending: false })
      .limit(10) as unknown as {
      data: SyncRunQueryRow[] | null
      error: Error | null
    }

    if (runsResponse.error) {
      runsResponse = await supabase
        .from("sync_runs")
        .select(SYNC_RUN_SELECT_LEGACY)
        .eq("user_id", user.id)
        .order("started_at", { ascending: false })
        .limit(10) as unknown as {
        data: SyncRunQueryRow[] | null
        error: Error | null
      }
    }

    if (connectionsResponse.error || runsResponse.error) {
      return {
        status: "error",
        backend: "supabase",
        supportsScheduledSync: true,
        connections: [],
        recentRuns: [],
        message: buildSyncStatusErrorMessage(connectionsResponse.error, runsResponse.error),
      }
    }

    const connections = (connectionsResponse.data ?? []).map(mapConnection)
    const recentRuns = (runsResponse.data ?? []).map(mapRun)

    return {
      status: "ok",
      backend: "supabase",
      supportsScheduledSync: true,
      connections,
      recentRuns,
      message:
        connections.length === 0
          ? "No broker connections are stored yet. Connect Trading 212 or eToro to start syncing positions, and this model is ready for future server-backed periodic refresh."
          : undefined,
    }
  }
}
