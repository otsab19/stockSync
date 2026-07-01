"use client"

import { useCallback, useEffect, useState } from "react"
import { Clock3 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import type { PortfolioSyncMode } from "@/types/portfolio"

type BrokerSchedule = {
  broker: "t212" | "etoro"
  label: string
  syncMode: PortfolioSyncMode
}

const defaultBrokers: BrokerSchedule[] = [
  { broker: "t212", label: "Trading 212", syncMode: "manual" },
  { broker: "etoro", label: "eToro", syncMode: "manual" },
]

export function ScheduledSyncCard() {
  const [brokers, setBrokers] = useState<BrokerSchedule[]>(defaultBrokers)
  const [message, setMessage] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState<string | null>(null)

  const loadSchedule = useCallback(async () => {
    try {
      const response = await fetch("/api/sync/status", { cache: "no-store" })
      if (!response.ok) return
      const data = await response.json() as {
        connections?: Array<{ broker: "t212" | "etoro"; syncMode?: PortfolioSyncMode }>
      }
      setBrokers(defaultBrokers.map((entry) => {
        const connection = data.connections?.find((item) => item.broker === entry.broker)
        return {
          ...entry,
          syncMode: connection?.syncMode === "scheduled" ? "scheduled" : "manual",
        }
      }))
    } catch {
      // Keep defaults when status endpoint is unavailable.
    }
  }, [])

  useEffect(() => {
    void loadSchedule()
  }, [loadSchedule])

  const updateSchedule = async (broker: "t212" | "etoro", syncMode: PortfolioSyncMode) => {
    setIsSaving(broker)
    setMessage(null)
    try {
      const response = await fetch("/api/sync/schedule", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ broker, syncMode }),
      })
      const data = await response.json() as { message?: string }
      if (!response.ok) throw new Error(data.message ?? "Failed to update schedule.")
      setBrokers((current) => current.map((entry) => entry.broker === broker ? { ...entry, syncMode } : entry))
      setMessage(data.message ?? "Schedule updated.")
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to update schedule.")
    } finally {
      setIsSaving(null)
    }
  }

  return (
    <Card className="border-border bg-muted/40">
      <CardHeader>
        <div className="flex items-center gap-2">
          <span className="flex size-9 items-center justify-center rounded-xl border border-border bg-muted/40">
            <Clock3 className="size-4 text-muted-foreground" />
          </span>
          <div>
            <CardTitle className="text-base">Automatic portfolio sync</CardTitle>
            <CardDescription>
              Run full broker sync on a schedule via `/api/cron/sync-portfolio` (hourly recommended).
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
        {brokers.map((entry) => (
          <div key={entry.broker} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-muted/40 px-3 py-3">
            <div>
              <p className="font-medium">{entry.label}</p>
              <p className="text-xs text-muted-foreground">
                {entry.syncMode === "scheduled" ? "Scheduled sync enabled" : "Manual sync only"}
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant={entry.syncMode === "manual" ? "default" : "outline"}
                className="rounded-xl"
                disabled={isSaving === entry.broker}
                onClick={() => void updateSchedule(entry.broker, "manual")}
              >
                Manual
              </Button>
              <Button
                size="sm"
                variant={entry.syncMode === "scheduled" ? "default" : "outline"}
                className="rounded-xl"
                disabled={isSaving === entry.broker}
                onClick={() => void updateSchedule(entry.broker, "scheduled")}
              >
                Auto
              </Button>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
