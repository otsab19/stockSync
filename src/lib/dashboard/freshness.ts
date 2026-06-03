import type { PortfolioDataMeta, PortfolioFreshness } from "@/types/portfolio"

const DEFAULT_STALE_AFTER_MINUTES = 60

export function getRelativeTime(value?: string | null) {
  if (!value) return "Never synced"

  const timestamp = new Date(value).getTime()
  if (!Number.isFinite(timestamp)) return "Unknown sync time"

  const diffMs = Date.now() - timestamp
  const absMs = Math.abs(diffMs)
  const rtf = new Intl.RelativeTimeFormat("en-GB", { numeric: "auto" })

  const minute = 60_000
  const hour = 60 * minute
  const day = 24 * hour

  if (absMs < minute) return "Just now"
  if (absMs < hour) return rtf.format(Math.round(-diffMs / minute), "minute")
  if (absMs < day) return rtf.format(Math.round(-diffMs / hour), "hour")
  return rtf.format(Math.round(-diffMs / day), "day")
}

export function calculateFreshness(
  lastSyncedAt?: string | null,
  source: "server" | "browser_local" = "server",
  staleAfterMinutes = DEFAULT_STALE_AFTER_MINUTES,
  hasError = false
): PortfolioFreshness {
  if (source === "browser_local") return "cached"
  if (hasError) return "stale"
  if (!lastSyncedAt) return "stale"

  const timestamp = new Date(lastSyncedAt).getTime()
  if (!Number.isFinite(timestamp)) return "stale"

  return Date.now() - timestamp > staleAfterMinutes * 60_000 ? "stale" : "live"
}

export function getPortfolioFreshness(meta?: PortfolioDataMeta | null, source: "server" | "browser_local" = "server") {
  return meta?.freshness ?? calculateFreshness(meta?.lastSyncedAt, source, meta?.staleAfterMinutes, Boolean(meta?.lastError))
}

export function getFreshnessLabel(freshness: PortfolioFreshness) {
  if (freshness === "live") return "Live"
  if (freshness === "cached") return "Cached"
  return "Stale"
}

export function getFreshnessDescription(meta?: PortfolioDataMeta | null, source: "server" | "browser_local" = "server") {
  const freshness = getPortfolioFreshness(meta, source)
  const syncText = getRelativeTime(meta?.lastSyncedAt)
  const sourceText = source === "browser_local" ? "browser cache" : "Supabase"
  return `${getFreshnessLabel(freshness)} from ${sourceText} · ${syncText}`
}
