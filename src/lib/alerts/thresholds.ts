import type { AlertStatus } from "@/types/portfolio"

export const PROFIT_ALERT_THRESHOLD_GBP = 25
export const PROFIT_ALERT_NEAR_WINDOW_GBP = 5

export function getAlertDelta(totalPlGbp: number, threshold = PROFIT_ALERT_THRESHOLD_GBP) {
  return Math.abs(threshold - Math.abs(totalPlGbp))
}

export function getAlertStatus(
  totalPlGbp: number,
  threshold = PROFIT_ALERT_THRESHOLD_GBP,
  nearWindow = PROFIT_ALERT_NEAR_WINDOW_GBP
): AlertStatus {
  const absoluteProfit = Math.abs(totalPlGbp)

  if (absoluteProfit >= threshold) {
    return "triggered"
  }

  if (threshold - absoluteProfit <= nearWindow) {
    return "near-alert"
  }

  return "stable"
}

