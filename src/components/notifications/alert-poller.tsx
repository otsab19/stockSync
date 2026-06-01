"use client"

import { useCallback, useEffect, useRef } from "react"
import type { MutableRefObject } from "react"
import { createClientPortfolioRepository } from "@/lib/portfolio/client-factory"
import { PROFIT_ALERT_THRESHOLD_GBP } from "@/lib/alerts/thresholds"
import type { PortfolioPosition } from "@/types/portfolio"

const POLL_INTERVAL_MS = 5 * 60 * 1000 // 5 minutes
const isSupabaseBackend = process.env.NEXT_PUBLIC_DATA_BACKEND !== "browser"

type AlertedState = Map<string, number> // key → last alerted PL bucket

function getPositionKey(p: { ticker: string; broker: string }) {
  return `${p.ticker}:${p.broker}`
}

/**
 * Show a browser notification for a triggered alert.
 * Works both when app is in foreground and (for installed PWAs) in background via SW.
 */
async function showAlertNotification(ticker: string, broker: string, pl: number) {
  if (!("Notification" in window)) return
  if (Notification.permission !== "granted") return

  const direction = pl > 0 ? "profit" : "loss"
  const sign = pl > 0 ? "+" : "-"
  const title = `£${Math.abs(pl).toFixed(0)} ${direction} on ${ticker}`
  const body = `${ticker} (${broker}) has reached ${sign}£${Math.abs(pl).toFixed(2)} P&L.`

  // Try via service worker (works in background for PWA)
  if ("serviceWorker" in navigator) {
    try {
      const registration = await navigator.serviceWorker.ready
      await registration.showNotification(title, {
        body,
        icon: "/icons/icon.svg",
        badge: "/icons/icon-maskable.svg",
        tag: `alert-${ticker}-${broker}`,
        renotify: true,
        data: { url: "/dashboard", timestamp: Date.now() },
      } as NotificationOptions)
      return
    } catch {
      // Fall through to Notification API
    }
  }

  // Fallback: direct Notification (foreground only)
  new Notification(title, { body, icon: "/icons/icon.svg", tag: `alert-${ticker}-${broker}` })
}

function checkThresholds(positions: PortfolioPosition[], alertedRef: MutableRefObject<AlertedState>) {
  for (const pos of positions) {
    const absPL = Math.abs(pos.totalPL)
    if (absPL < PROFIT_ALERT_THRESHOLD_GBP) {
      // Below threshold — reset
      alertedRef.current.delete(getPositionKey(pos))
      continue
    }

    const currentBucket = Math.floor(absPL / PROFIT_ALERT_THRESHOLD_GBP)
    const lastBucket = alertedRef.current.get(getPositionKey(pos)) ?? 0

    if (currentBucket > lastBucket) {
      alertedRef.current.set(getPositionKey(pos), currentBucket)
      showAlertNotification(pos.ticker, pos.brokerLabel, pos.totalPL)
    }
  }
}

export function AlertPoller() {
  const alertedRef = useRef<AlertedState>(new Map())

  const runCheck = useCallback(async () => {
    try {
      const repository = createClientPortfolioRepository()

      const data = await repository.getPortfolio()

      if (data.status === "ok" && data.portfolio.length > 0) {
        checkThresholds(data.portfolio, alertedRef)
      }
    } catch {
      // Silent — don't break polling on transient errors
    }

    // Also ping server alert check in supabase mode (for push to other devices)
    if (isSupabaseBackend) {
      try { await fetch("/api/cron/check-alerts") } catch { /* silent */ }
    }
  }, [])

  useEffect(() => {
    // Request notification permission on mount if not yet decided
    if ("Notification" in window && Notification.permission === "default") {
      // Don't prompt immediately — wait for user interaction via NotificationToggle
    }

    // Initial check after 30s
    const initialTimeout = setTimeout(runCheck, 30_000)
    // Then every 5 min
    const interval = setInterval(runCheck, POLL_INTERVAL_MS)

    return () => {
      clearTimeout(initialTimeout)
      clearInterval(interval)
    }
  }, [runCheck])

  return null
}

