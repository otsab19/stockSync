import type { ElementType, ReactNode } from "react"
import { AlertCircle, ArrowRightLeft, PoundSterling, TrendingDown, TrendingUp } from "lucide-react"
import type { CurrencyMode, PortfolioInsights } from "@/types/portfolio"

interface KpiStripProps {
  insights: PortfolioInsights
  currencyMode: CurrencyMode
  activeBrokerFilterLabel: string
  totalValueLabel: string
  totalReturnLabel: string
  onFocusAlerts: () => void
}

function KpiCard({
  label,
  value,
  sub,
  icon: Icon,
  iconBg,
  iconColor,
  onClick,
}: {
  label: string
  value: ReactNode
  sub: ReactNode
  icon: ElementType
  iconBg: string
  iconColor: string
  onClick?: () => void
}) {
  const inner = (
    <div className="flex items-start gap-4 rounded-xl border border-border bg-card p-5 card-shadow-md transition-colors hover:bg-muted/30">
      <div className={`flex size-11 shrink-0 items-center justify-center rounded-lg ${iconBg}`}>
        <Icon className={`size-5 ${iconColor}`} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <p className="mt-0.5 text-xl font-bold tracking-tight truncate">{value}</p>
        <p className="mt-1 text-xs text-muted-foreground truncate">{sub}</p>
      </div>
    </div>
  )
  if (onClick) return <button type="button" className="block w-full text-left" onClick={onClick}>{inner}</button>
  return inner
}

export function KpiStrip({ insights, currencyMode, activeBrokerFilterLabel, totalValueLabel, totalReturnLabel, onFocusAlerts }: KpiStripProps) {
  const isPositive = insights.totalNetReturnGbp >= 0
  const hasAlerts = insights.activeAlertStates > 0

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <KpiCard
        label="Portfolio value"
        value={totalValueLabel}
        sub={currencyMode === "native" ? "Mixed native currencies" : "All positions in GBP"}
        icon={PoundSterling}
        iconBg="bg-primary/10"
        iconColor="text-primary"
      />

      <KpiCard
        label="Total return"
        value={<span className={isPositive ? "text-emerald-500 dark:text-emerald-400" : "text-red-500 dark:text-red-400"}>{totalReturnLabel}</span>}
        sub={`${insights.totalNetReturnPercent >= 0 ? "+" : ""}${insights.totalNetReturnPercent.toFixed(2)}% on cost basis`}
        icon={isPositive ? TrendingUp : TrendingDown}
        iconBg={isPositive ? "bg-emerald-500/10" : "bg-red-500/10"}
        iconColor={isPositive ? "text-emerald-500" : "text-red-500"}
      />

      <KpiCard
        label="Alert states"
        value={insights.activeAlertStates}
        sub={hasAlerts ? `Tap to focus on ${activeBrokerFilterLabel}` : "No active alerts"}
        icon={AlertCircle}
        iconBg={hasAlerts ? "bg-amber-500/10" : "bg-muted"}
        iconColor={hasAlerts ? "text-amber-500" : "text-muted-foreground"}
        onClick={onFocusAlerts}
      />

      <div className="rounded-xl border border-border bg-card p-5 card-shadow-md">
        <div className="flex items-center gap-3 mb-3">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-sky-500/10">
            <ArrowRightLeft className="size-5 text-sky-500" />
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground">Broker split</p>
            <p className="text-sm font-semibold">{insights.brokerDistribution.length} broker{insights.brokerDistribution.length !== 1 ? "s" : ""}</p>
          </div>
        </div>
        <div className="space-y-2">
          {insights.brokerDistribution.map((entry) => (
            <div key={entry.broker} className="space-y-1">
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">{entry.brokerLabel}</span>
                <span className="font-medium">{Math.round(entry.percentage)}%</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className={entry.broker === "t212" ? "h-full rounded-full bg-emerald-500" : "h-full rounded-full bg-sky-500"}
                  style={{ width: `${entry.percentage}%` }}
                />
              </div>
            </div>
          ))}
          {insights.brokerDistribution.length === 0 && (
            <p className="text-xs text-muted-foreground">No active positions</p>
          )}
        </div>
      </div>
    </div>
  )
}

