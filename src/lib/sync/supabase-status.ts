import { createClient, getSupabaseSetupMessage } from "@/utils/supabase/server"
import type { SyncStatusRepository } from "@/lib/sync/repository"
import type { Database } from "@/types/supabase"
import type { BrokerConnectionSummary, SyncRunSummary, SyncStatusApiResponse } from "@/types/sync"

type BrokerConnectionRow = Database["public"]["Tables"]["broker_connections"]["Row"]
type SyncRunRow = Database["public"]["Tables"]["sync_runs"]["Row"]

function mapConnection(row: BrokerConnectionRow): BrokerConnectionSummary {
  return {
    id: row.id,
    broker: row.broker,
    sourceType: row.source_type,
    syncMode: row.sync_mode,
    syncStatus: row.sync_status,
    isEnabled: row.is_enabled,
    lastSyncedAt: row.last_synced_at,
    lastError: row.last_error,
  }
}

function mapRun(row: SyncRunRow): SyncRunSummary {
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
    errorMessage: row.error_message,
  }
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

    const [connectionsResponse, runsResponse] = await Promise.all([
      supabase
        .from("broker_connections")
        .select("id, broker, source_type, sync_mode, sync_status, is_enabled, last_synced_at, last_error")
        .order("updated_at", { ascending: false }),
      supabase
        .from("sync_runs")
        .select("id, connection_id, broker, trigger, source_type, status, positions_imported, error_message, started_at, finished_at")
        .order("started_at", { ascending: false })
        .limit(10),
    ])

    if (connectionsResponse.error || runsResponse.error) {
      return {
        status: "error",
        backend: "supabase",
        supportsScheduledSync: true,
        connections: [],
        recentRuns: [],
        message:
          "The broker sync tables are not ready yet. Apply the latest Supabase migration so broker_connections and sync_runs exist.",
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

