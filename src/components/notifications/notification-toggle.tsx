"use client"

import { Bell, BellOff, BellRing } from "lucide-react"
import { usePushNotifications } from "@/lib/notifications/use-push"

export function NotificationToggle() {
  const { state, error, subscribe, unsubscribe } = usePushNotifications()

  if (state === "unsupported") {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
        <BellOff className="h-3.5 w-3.5" />
        <span>Push notifications not supported in this browser</span>
      </div>
    )
  }

  if (state === "denied") {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2 text-xs text-red-400">
        <BellOff className="h-3.5 w-3.5" />
        <span>Notifications blocked — enable in browser settings</span>
      </div>
    )
  }

  if (state === "subscribed") {
    return (
      <button
        onClick={unsubscribe}
        className="flex items-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-2 text-xs text-emerald-400 transition-colors hover:bg-emerald-500/10"
      >
        <BellRing className="h-3.5 w-3.5" />
        <span>Alerts enabled — tap to disable</span>
      </button>
    )
  }

  return (
    <div className="space-y-1">
      <button
        onClick={subscribe}
        disabled={state === "loading"}
        className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs text-foreground transition-colors hover:bg-muted/40 disabled:opacity-50"
      >
        <Bell className="h-3.5 w-3.5" />
        <span>{state === "loading" ? "Enabling..." : "Enable push alerts (±£25 P&L)"}</span>
      </button>
      {error && <p className="text-[0.65rem] text-red-400">{error}</p>}
    </div>
  )
}

