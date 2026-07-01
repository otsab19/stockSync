import { AlertCircle, ArrowRightLeft, PoundSterling, TrendingUp } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import type { CurrencyMode, PortfolioInsights } from "@/types/portfolio"

interface KpiStripProps {
  insights: PortfolioInsights
  currencyMode: CurrencyMode
  activeBrokerFilterLabel: string
  totalValueLabel: string
  totalReturnLabel: string
  onFocusAlerts: () => void
}

export function KpiStrip({ insights, currencyMode, activeBrokerFilterLabel, totalValueLabel, totalReturnLabel, onFocusAlerts }: KpiStripProps) {
  const allocationSummary = insights.brokerDistribution
    .map((entry) => `${Math.round(entry.percentage)}% ${entry.brokerLabel}`)
    .join(" / ")

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <Card size="sm">
        <CardHeader className="flex flex-row items-start justify-between gap-3 pb-1">
          <div className="space-y-1">
            <CardDescription>Total portfolio value</CardDescription>
            <CardTitle className="text-2xl sm:text-[1.8rem]">{totalValueLabel}</CardTitle>
          </div>
          <span className="flex size-9 items-center justify-center rounded-lg border border-border bg-muted">
            <PoundSterling className="size-5 text-muted-foreground" />
          </span>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground">
            {currencyMode === "native" ? "Showing mixed native-currency totals." : "Unified across all currently visible positions in GBP."}
          </p>
        </CardContent>
      </Card>

      <Card size="sm">
        <CardHeader className="flex flex-row items-start justify-between gap-3 pb-1">
          <div className="space-y-1">
            <CardDescription>Total net return</CardDescription>
            <CardTitle className={`text-2xl sm:text-[1.8rem] ${insights.totalNetReturnGbp >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
              {totalReturnLabel}
            </CardTitle>
          </div>
          <span className="flex size-9 items-center justify-center rounded-lg border border-border bg-muted">
            <TrendingUp className="size-5 text-muted-foreground" />
          </span>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground">
            {insights.totalNetReturnPercent >= 0 ? "+" : ""}
            {insights.totalNetReturnPercent.toFixed(2)}% against the current cost basis.
          </p>
        </CardContent>
      </Card>

      <button type="button" className="text-left" onClick={onFocusAlerts}>
        <Card className="h-full transition-colors hover:bg-muted/30">
          <CardHeader className="flex flex-row items-start justify-between gap-3 pb-1">
            <div className="space-y-1">
              <CardDescription>Active alert states</CardDescription>
              <CardTitle className="text-2xl sm:text-[1.8rem]">{insights.activeAlertStates}</CardTitle>
            </div>
            <span className="flex size-9 items-center justify-center rounded-lg border border-border bg-muted">
              <AlertCircle className="size-5 text-muted-foreground" />
            </span>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              Positions within £5 of the £25 alert threshold. Tap to focus the table on {activeBrokerFilterLabel}.
            </p>
          </CardContent>
        </Card>
      </button>

      <Card size="sm">
        <CardHeader className="flex flex-row items-start justify-between gap-3 pb-1">
          <div className="space-y-1">
            <CardDescription>Broker distribution</CardDescription>
            <CardTitle className="text-lg sm:text-xl">{allocationSummary || "No active positions"}</CardTitle>
          </div>
          <span className="flex size-9 items-center justify-center rounded-lg border border-border bg-muted">
            <ArrowRightLeft className="size-5 text-muted-foreground" />
          </span>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div className="h-2 overflow-hidden rounded-full bg-muted/70">
              <div className="flex h-full">
                {insights.brokerDistribution.map((entry) => (
                  <div
                    key={entry.broker}
                    className={entry.broker === "t212" ? "bg-emerald-400" : "bg-sky-400"}
                    style={{ width: `${entry.percentage}%` }}
                  />
                ))}
              </div>
            </div>
            <p className="text-xs text-muted-foreground">Current value split by broker.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

