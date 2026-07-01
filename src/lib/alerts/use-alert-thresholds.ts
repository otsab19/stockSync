"use client"

import { useCallback, useEffect, useState } from "react"
import { getAllTickerThresholds, getGlobalThreshold, resolveThresholdForTicker } from "@/lib/alerts/custom-thresholds"
import { getAlertStatus, getAlertDelta } from "@/lib/alerts/thresholds"
import type { AlertStatus } from "@/types/portfolio"

export type ResolvedAlertInfo = {
  alertStatus: AlertStatus
  alertDelta: number
  thresholdGbp: number
  nearWindowGbp: number
}

export function useAlertThresholds() {
  const [version, setVersion] = useState(0)

  const refresh = useCallback(() => setVersion((v) => v + 1), [])

  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key === "stocksync:alert_thresholds") refresh()
    }
    window.addEventListener("storage", onStorage)
    return () => window.removeEventListener("storage", onStorage)
  }, [refresh])

  const resolveForTicker = useCallback((ticker: string, totalPlGbp: number): ResolvedAlertInfo => {
    const { thresholdGbp, nearWindowGbp } = resolveThresholdForTicker(ticker)
    return {
      alertStatus: getAlertStatus(totalPlGbp, thresholdGbp, nearWindowGbp),
      alertDelta: getAlertDelta(totalPlGbp, thresholdGbp),
      thresholdGbp,
      nearWindowGbp,
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version])

  const globalThreshold = useCallback(() => getGlobalThreshold(), [version])
  const allOverrides = useCallback(() => getAllTickerThresholds(), [version])

  return { resolveForTicker, globalThreshold, allOverrides, refresh }
}
