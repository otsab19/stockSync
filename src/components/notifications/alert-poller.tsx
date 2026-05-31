"use client"

import { useEffect, useRef } from "react"

const POLL_INTERVAL_MS = 15 * 60 * 1000 // 15 minutes
const isSupabaseBackend = process.env.NEXT_PUBLIC_DATA_BACKEND !== "browser"

export function AlertPoller() {
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (!isSupabaseBackend) return

    async function checkAlerts() {
      try {
        await fetch("/api/cron/check-alerts")
      } catch {
        // silent
      }
    }

    // Initial check after 30s
    const initialTimeout = setTimeout(checkAlerts, 30_000)
    // Then every 15 min
    timerRef.current = setInterval(checkAlerts, POLL_INTERVAL_MS)

    return () => {
      clearTimeout(initialTimeout)
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [])

  return null
}

