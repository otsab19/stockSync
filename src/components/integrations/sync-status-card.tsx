"use client"

import { useCallback, useEffect, useState } from "react"
import { LoaderCircle, RefreshCw } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import type { SyncStatusApiResponse } from "@/types/sync"

const statusLabels = {
  disabled: "Browser-only",
  error: "Error",
  ok: "Ready",
  setup_required: "Setup required",
  unauthorized: "Sign-in required",
} as const

const brokerLabels = {
  etoro: "eToro",
  t212: "Trading 212",
} as const

const sourceTypeLabels = {
  broker_api: "Broker API",
  manual_csv: "Manual import",
} as const

const syncModeLabels = {
  manual: "Manual",
  scheduled: "Scheduled",
} as const

const connectionStatusLabels = {
  failed: "Failed",
  never_synced: "Never synced",
  ready: "Ready",
  running: "Running",
  succeeded: "Succeeded",
} as const

const runStatusLabels = {
  failed: "Failed",
  running: "Running",
  succeeded: "Succeeded",
} as const

const triggerLabels = {
  manual: "Manual",
  scheduled: "Scheduled",
} as const

function getStatusBadgeVariant(status: SyncStatusApiResponse["status"]): "destructive" | "outline" | "secondary" {
  switch (status) {
    case "error":
    case "unauthorized":
      return "destructive"
    case "ok":
      return "secondary"
    case "disabled":
    case "setup_required":
    default:
      return "outline"
  }
}

function formatDateTime(value: string | null) {
  if (!value) {
    return null
  }

  return new Date(value).toLocaleString()
}

function createStatusFallback(message = "Unable to load broker sync status from the server."): SyncStatusApiResponse {
  return {
    status: "error",
    backend: "supabase",
    supportsScheduledSync: true,
    connections: [],
    recentRuns: [],
    message,
  }
}

async function fetchSyncStatus(signal?: AbortSignal): Promise<SyncStatusApiResponse> {
  const result = await fetch("/api/sync/status", { cache: "no-store", signal })
  return (await result.json()) as SyncStatusApiResponse
}

export function SyncStatusCard() {
  const [response, setResponse] = useState<SyncStatusApiResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const loadStatus = useCallback(async (mode: "initial" | "refresh" = "initial", signal?: AbortSignal) => {
    if (mode === "refresh") {
      setRefreshing(true)
    }

    try {
      const data = await fetchSyncStatus(signal)

      setResponse(data)
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return
      }

      console.error("Failed to load sync status:", error)
      setResponse(createStatusFallback())
    } finally {
      if (mode === "initial") {
        setLoading(false)
      } else if (!signal?.aborted) {
        setRefreshing(false)
      }
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()

    async function loadInitialStatus() {
      try {
        const data = await fetchSyncStatus(controller.signal)

        setResponse(data)
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return
        }

        console.error("Failed to load sync status:", error)
        setResponse(createStatusFallback())
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false)
        }
      }
    }

    void loadInitialStatus()

    return () => {
      controller.abort()
    }
  }, [])

  async function handleRefresh() {
    await loadStatus("refresh")
  }

  const activeStatus = response?.status ?? "error"
  const statusLabel = loading ? "Loading" : response ? statusLabels[response.status] : "Unknown"
  const isBusy = loading || refreshing

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">Periodic sync scaffold</Badge>
            <Badge variant={getStatusBadgeVariant(activeStatus)}>{statusLabel}</Badge>
            {response ? <Badge variant="outline">Backend: {response.backend}</Badge> : null}
            {response ? (
              <Badge variant="outline">{response.supportsScheduledSync ? "Scheduled sync supported" : "Manual-only mode"}</Badge>
            ) : null}
          </div>
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={isBusy} className="gap-2">
            {isBusy ? <LoaderCircle className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
            {loading ? "Loading..." : refreshing ? "Refreshing..." : "Refresh status"}
          </Button>
        </div>
        <CardTitle>Server-backed sync status</CardTitle>
        <CardDescription>
          This is the foundation for periodic Trading 212 and eToro refresh once real broker APIs are wired into the server-backed mode.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 text-sm text-muted-foreground">
        <div className="rounded-xl border border-dashed px-4 py-3">
          <p>
            {loading
              ? "Loading current sync capability..."
              : response?.message ?? "Sync status loaded."}
          </p>
          {!loading && response?.status === "unauthorized" ? (
            <p className="mt-2 text-xs">Open a signed-in Supabase session, then refresh this card to load stored broker connections.</p>
          ) : null}
          {!loading && response?.status === "setup_required" ? (
            <p className="mt-2 text-xs">Configure Supabase server access and apply the latest migration before enabling periodic sync.</p>
          ) : null}
          {!loading && response?.status === "disabled" ? (
            <p className="mt-2 text-xs">Browser mode still supports local broker syncing even while server-backed sync is unavailable.</p>
          ) : null}
          {!loading && response?.status === "error" ? (
            <p className="mt-2 text-xs">
              If this persists, run <code className="rounded bg-white/5 px-1 py-0.5">supabase db push</code> against your project so broker_connections, sync_runs, and the Phase 1 columns exist.
            </p>
          ) : null}
        </div>

        {response?.status === "ok" ? (
          <>
            <div className="space-y-2">
              <p className="font-medium text-foreground">Broker connections</p>
              {response.connections.length === 0 ? (
                <p>No broker connections are stored yet.</p>
              ) : (
                response.connections.map((connection) => (
                  <div key={connection.id} className="rounded-xl border px-3 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline">{brokerLabels[connection.broker]}</Badge>
                      <Badge variant="secondary">{sourceTypeLabels[connection.sourceType]}</Badge>
                      <Badge variant="secondary">{syncModeLabels[connection.syncMode]}</Badge>
                      <Badge variant={connection.syncStatus === "failed" ? "destructive" : "secondary"}>
                        {connectionStatusLabels[connection.syncStatus]}
                      </Badge>
                      <Badge variant={connection.isEnabled ? "outline" : "destructive"}>
                        {connection.isEnabled ? "Enabled" : "Disabled"}
                      </Badge>
                    </div>
                    <p className="mt-2 text-xs">
                      {connection.lastSyncedAt
                        ? `Last synced ${formatDateTime(connection.lastSyncedAt)}`
                        : "This connection has not completed a sync yet."}
                    </p>
                    {connection.lastPositionsStored !== null ? (
                      <p className="mt-1 text-xs">
                        Last sync stored {connection.lastPositionsStored} lot{connection.lastPositionsStored === 1 ? "" : "s"}
                        {connection.lastPositionsMapped !== null && connection.lastPositionsMapped !== connection.lastPositionsStored
                          ? ` (${connection.lastPositionsMapped} mapped from broker API)`
                          : ""}
                        {connection.lastActivityImported !== null ? ` · ${connection.lastActivityImported} activity events` : ""}
                      </p>
                    ) : null}
                    {connection.lastError ? <p className="mt-1 text-xs text-destructive">Last error: {connection.lastError}</p> : null}
                  </div>
                ))
              )}
            </div>

            <div className="space-y-2">
              <p className="font-medium text-foreground">Recent sync runs</p>
              {response.recentRuns.length === 0 ? (
                <p>No sync runs have been recorded yet.</p>
              ) : (
                response.recentRuns.map((run) => (
                  <div key={run.id} className="rounded-xl border px-3 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline">{brokerLabels[run.broker]}</Badge>
                      <Badge variant="secondary">{sourceTypeLabels[run.sourceType]}</Badge>
                      <Badge variant="secondary">{triggerLabels[run.trigger]}</Badge>
                      <Badge variant={run.status === "failed" ? "destructive" : "secondary"}>{runStatusLabels[run.status]}</Badge>
                    </div>
                    <p className="mt-2 text-xs">
                      Started {formatDateTime(run.startedAt)}
                      {run.finishedAt ? ` • Finished ${formatDateTime(run.finishedAt)}` : " • Still running"}
                      {` • Stored ${run.positionsImported} lot${run.positionsImported === 1 ? "" : "s"}`}
                      {run.positionsMapped !== run.positionsImported ? ` (${run.positionsMapped} mapped)` : ""}
                      {run.activityImported > 0 ? ` · ${run.activityImported} activity events` : ""}
                    </p>
                    {run.errorMessage ? <p className="mt-1 text-xs text-destructive">Error: {run.errorMessage}</p> : null}
                  </div>
                ))
              )}
            </div>
          </>
        ) : null}
      </CardContent>
    </Card>
  )
}

