"use client"

import { useState } from "react"
import { Bell } from "lucide-react"

export function TestNotificationButton() {
  const [status, setStatus] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleTest() {
    setLoading(true)
    setStatus(null)
    try {
      const res = await fetch("/api/push/test", { method: "POST" })
      const data = await res.json()
      setStatus(data.message)
    } catch {
      setStatus("Failed to send test notification.")
    }
    setLoading(false)
  }

  return (
    <div className="space-y-2">
      <button
        onClick={handleTest}
        disabled={loading}
        className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-foreground transition-colors hover:bg-white/[0.06] disabled:opacity-50"
      >
        <Bell className="h-3.5 w-3.5" />
        <span>{loading ? "Sending..." : "Send test notification"}</span>
      </button>
      {status && <p className="text-[0.7rem] text-muted-foreground">{status}</p>}
    </div>
  )
}

