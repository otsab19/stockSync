import { Badge } from "@/components/ui/badge"
import { getFreshnessDescription, getFreshnessLabel, getPortfolioFreshness, getRelativeTime } from "@/lib/dashboard/freshness"
import type { PortfolioDataMeta, PortfolioFreshness } from "@/types/portfolio"

function getFreshnessClassName(freshness: PortfolioFreshness) {
  if (freshness === "live") return "border-emerald-500/20 bg-emerald-500/10 text-emerald-300"
  if (freshness === "cached") return "border-sky-500/20 bg-sky-500/10 text-sky-300"
  return "border-amber-500/20 bg-amber-500/10 text-amber-200"
}

export function FreshnessBadge({
  meta,
  source = "server",
  compact = false,
}: {
  meta?: PortfolioDataMeta | null
  source?: "server" | "browser_local"
  compact?: boolean
}) {
  const freshness = getPortfolioFreshness(meta, source)
  const label = compact ? getFreshnessLabel(freshness) : getFreshnessDescription(meta, source)

  return (
    <Badge variant="outline" className={getFreshnessClassName(freshness)} title={getFreshnessDescription(meta, source)}>
      {label}
    </Badge>
  )
}

export function BrokerFreshnessList({ meta }: { meta?: PortfolioDataMeta | null }) {
  const brokers = meta?.brokerDetails ?? []

  if (brokers.length === 0) {
    return null
  }

  return (
    <div className="flex flex-wrap gap-2">
      {brokers.map((broker) => (
        <Badge
          key={broker.broker}
          variant="outline"
          className={getFreshnessClassName(broker.freshness ?? "stale")}
          title={broker.lastError ?? undefined}
        >
          {broker.broker === "t212" ? "Trading 212" : "eToro"} · {broker.syncStatus ?? "unknown"} · {getRelativeTime(broker.lastSyncedAt)}
        </Badge>
      ))}
    </div>
  )
}
