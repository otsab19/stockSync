"use client"

import Link from "next/link"
import { Suspense, useCallback, useEffect, useMemo, useState } from "react"
import { ChartCandlestick, RefreshCw } from "lucide-react"
import { PageHeader, PageShell } from "@/components/app/page-shell"
import { BrokerFreshnessList, FreshnessBadge } from "@/components/dashboard/freshness-badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { FilterBar } from "@/components/dashboard/filter-bar"
import { KpiStrip } from "@/components/dashboard/kpi-strip"
import { PortfolioCharts } from "@/components/dashboard/portfolio-charts"
import { PortfolioTable } from "@/components/dashboard/portfolio-table"
import { buildSellPlLookup, filterActivityByDateRange, getDateRangeForPreset, summarizeActivityPeriod } from "@/lib/dashboard/activity-view"
import { buildInsights, defaultFilterState, filterActivity, filterPortfolio, formatMoney, getDisplayProfit } from "@/lib/dashboard/filter-engine"
import type { FilterState } from "@/lib/dashboard/filter-engine"
import { createClientPortfolioRepository } from "@/lib/portfolio/client-factory"
import type { CurrencyMode, PortfolioApiResponse, PortfolioPosition } from "@/types/portfolio"

type DashboardState = "loading" | "ready" | "setup_required" | "unauthorized" | "client_only" | "error"



function hasInsightAffectingFilters(filters: FilterState) {
  return Boolean(
    filters.searchQuery.trim()
      || filters.brokers.length > 0
      || filters.assetType !== "all"
      || filters.plStatus !== "all"
  )
}

function formatMixedCurrencyTotals(portfolio: PortfolioPosition[], currencyMode: CurrencyMode) {
  if (currencyMode === "normalized_gbp") {
    return formatMoney(portfolio.reduce((sum, position) => sum + position.normalizedTotalValueGbp, 0), "GBP")
  }

  const totals = portfolio.reduce(
    (accumulator, position) => {
      accumulator[position.nativeCurrency] += position.nativeTotalValue
      return accumulator
    },
    { GBP: 0, USD: 0 }
  )

  return [
    totals.GBP > 0 ? formatMoney(totals.GBP, "GBP") : null,
    totals.USD > 0 ? formatMoney(totals.USD, "USD") : null,
  ]
    .filter(Boolean)
    .join(" • ")
}

function formatMixedProfitTotals(portfolio: PortfolioPosition[], currencyMode: CurrencyMode) {
  if (currencyMode === "normalized_gbp") {
    const total = portfolio.reduce((sum, position) => sum + position.totalPL, 0)
    return `${total >= 0 ? "+" : ""}${formatMoney(total, "GBP")}`
  }

  const totals = portfolio.reduce(
    (accumulator, position) => {
      accumulator[position.nativeCurrency] += getDisplayProfit(position, "native")
      return accumulator
    },
    { GBP: 0, USD: 0 }
  )

  return [
    totals.GBP !== 0 ? `${totals.GBP >= 0 ? "+" : ""}${formatMoney(totals.GBP, "GBP")}` : null,
    totals.USD !== 0 ? `${totals.USD >= 0 ? "+" : ""}${formatMoney(totals.USD, "USD")}` : null,
  ]
    .filter(Boolean)
    .join(" • ")
}

function formatSignedMoney(value: number) {
  return `${value >= 0 ? "+" : ""}${formatMoney(value, "GBP")}`
}

function DashboardTodaySummary({
  summary,
  activityCount,
  biggestMovers,
}: {
  summary: ReturnType<typeof summarizeActivityPeriod>
  activityCount: number
  biggestMovers: PortfolioPosition[]
}) {
  return (
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
      <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
        <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-muted-foreground">Bought today</p>
        <p className="mt-2 text-xl font-semibold tracking-tight text-emerald-400">{formatMoney(summary.totalBoughtGbp, "GBP")}</p>
        <p className="mt-1 text-xs text-muted-foreground">{summary.buyCount} buy leg{summary.buyCount === 1 ? "" : "s"}</p>
      </div>
      <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
        <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-muted-foreground">Sold today</p>
        <p className="mt-2 text-xl font-semibold tracking-tight text-red-400">{formatMoney(summary.totalSoldGbp, "GBP")}</p>
        <p className="mt-1 text-xs text-muted-foreground">{summary.sellCount} sell leg{summary.sellCount === 1 ? "" : "s"}</p>
      </div>
      <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
        <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-muted-foreground">Realised P/L</p>
        <p className={`mt-2 text-xl font-semibold tracking-tight ${summary.totalRealisedPlGbp >= 0 ? "text-emerald-400" : "text-red-400"}`}>
          {formatSignedMoney(summary.totalRealisedPlGbp)}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">Closed sells today</p>
      </div>
      <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
        <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-muted-foreground">Activity</p>
        <p className="mt-2 text-xl font-semibold tracking-tight">{activityCount}</p>
        <p className="mt-1 text-xs text-muted-foreground">Trade legs today</p>
      </div>
      <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
        <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-muted-foreground">Biggest mover</p>
        {biggestMovers[0] ? (
          <>
            <p className="mt-2 truncate text-xl font-semibold tracking-tight">{biggestMovers[0].ticker}</p>
            <p className={`mt-1 text-xs font-medium ${biggestMovers[0].totalPLPercent >= 0 ? "text-emerald-400" : "text-red-400"}`}>
              {biggestMovers[0].totalPLPercent >= 0 ? "+" : ""}{biggestMovers[0].totalPLPercent.toFixed(2)}%
            </p>
          </>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">No holdings yet</p>
        )}
      </div>
    </section>
  )
}


function DashboardContent() {
  const [portfolio, setPortfolio] = useState<PortfolioPosition[]>([])
  const [portfolioResponse, setPortfolioResponse] = useState<PortfolioApiResponse | null>(null)
  const [dashboardState, setDashboardState] = useState<DashboardState>("loading")
  const [filters, setFilters] = useState(defaultFilterState)
  const [highlightedTicker, setHighlightedTicker] = useState<string | null>(null)
  const [isRefreshing, setIsRefreshing] = useState(false)

  const fetchPortfolio = useCallback(async () => {
    try {
      setIsRefreshing(true)

      const repository = createClientPortfolioRepository()
      const data: PortfolioApiResponse = await repository.getPortfolio({
        includeActivity: true,
      })

      setPortfolioResponse(data)
      setPortfolio(data.portfolio)

      if (data.status === "ok") {
        setDashboardState("ready")
        return
      }

      setDashboardState(data.status)
    } catch (error) {
      console.error("Failed to fetch portfolio:", error)
      setPortfolioResponse(null)
      setPortfolio([])
      setDashboardState("error")
    } finally {
      setIsRefreshing(false)
    }
  }, [])

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void fetchPortfolio()
    }, 0)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [fetchPortfolio])


  const filteredPortfolio = useMemo(() => filterPortfolio(portfolio, filters), [filters, portfolio])
  const filteredActivity = useMemo(() => {
    if (portfolioResponse?.status !== "ok") {
      return []
    }

    const baseActivity = portfolioResponse.activity ?? portfolioResponse.insights.activity
    return hasInsightAffectingFilters(filters) ? filterActivity(baseActivity, filteredPortfolio) : baseActivity
  }, [filteredPortfolio, filters, portfolioResponse])
  const filteredInsights = useMemo(() => {
    const baseInsights = portfolioResponse?.status === "ok" ? portfolioResponse.insights : null

    if (!hasInsightAffectingFilters(filters) && baseInsights) {
      return baseInsights
    }

    return buildInsights(filteredPortfolio, filteredActivity)
  }, [filteredActivity, filters, filteredPortfolio, portfolioResponse])
  const todayActivity = useMemo(() => {
    const range = getDateRangeForPreset("today")
    return filterActivityByDateRange(filteredActivity, range.start, range.end)
  }, [filteredActivity])
  const todaySummary = useMemo(
    () => summarizeActivityPeriod(todayActivity, buildSellPlLookup(filteredActivity)),
    [filteredActivity, todayActivity]
  )
  const biggestMovers = useMemo(
    () => filteredPortfolio.slice().sort((left, right) => Math.abs(right.totalPLPercent) - Math.abs(left.totalPLPercent)).slice(0, 3),
    [filteredPortfolio]
  )
  const availableBrokers = useMemo(
    () => Array.from(new Map(portfolio.map((position) => [position.broker, { broker: position.broker, label: position.brokerLabel }])).values()),
    [portfolio]
  )
  const hasPositions = portfolio.length > 0
  const activeBrokerFilterLabel = filters.brokers.length === 0 ? "all brokers" : filters.brokers.join(" + ")
  const totalValueLabel = formatMixedCurrencyTotals(filteredPortfolio, filters.currencyMode)
  const totalReturnLabel = formatMixedProfitTotals(filteredPortfolio, filters.currencyMode)
  const isEmptyState = dashboardState === "ready" && !hasPositions

  return (
    <PageShell>
      <PageHeader
        eyebrow="Portfolio"
        title="Dashboard"
        description={hasPositions ? `${totalValueLabel} • ${totalReturnLabel}` : "Connect Trading 212 or eToro to start tracking holdings, trades, and alerts."}
        badges={
          <>
            <FreshnessBadge meta={portfolioResponse?.meta} source={portfolioResponse?.source ?? "server"} />
            <BrokerFreshnessList meta={portfolioResponse?.meta} />
          </>
        }
        actions={
          <>
          <Button variant="outline" size="sm" onClick={() => void fetchPortfolio()} disabled={isRefreshing} className="gap-2 rounded-xl border-white/10 bg-white/[0.03]">
            <RefreshCw className={isRefreshing ? "size-4 animate-spin" : "size-4"} />
            {isRefreshing ? "Refreshing..." : "Refresh"}
          </Button>
          <Link
            href="/dashboard/history"
            className="inline-flex h-8 items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.03] px-3 text-sm transition-colors hover:bg-white/[0.06]"
          >
            <ChartCandlestick className="size-3.5" />
            History
          </Link>
          </>
        }
      />

      {isEmptyState ? (
        <Card className="border-dashed border-white/12 bg-white/[0.02]">
          <CardHeader>
            <CardTitle>No holdings loaded</CardTitle>
            <CardDescription>Connect Trading 212 or eToro to populate the dashboard.</CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/integrations" className="text-sm font-medium text-primary hover:text-primary/80">
              Open broker connections
            </Link>
          </CardContent>
        </Card>
      ) : (
        <>
          <DashboardTodaySummary summary={todaySummary} activityCount={todayActivity.length} biggestMovers={biggestMovers} />

          <KpiStrip
            insights={filteredInsights}
            currencyMode={filters.currencyMode}
            activeBrokerFilterLabel={activeBrokerFilterLabel}
            totalValueLabel={totalValueLabel || "—"}
            totalReturnLabel={totalReturnLabel || "—"}
            onFocusAlerts={() => setFilters((current) => ({ ...current, plStatus: "near-alert" }))}
          />

          <FilterBar
            filters={filters}
            availableBrokers={availableBrokers}
            resultCount={filteredPortfolio.length}
            totalCount={portfolio.length}
            onFiltersChange={setFilters}
          />

          <PortfolioCharts insights={filteredInsights} onHighlightAsset={setHighlightedTicker} />
          <PortfolioTable
            portfolio={filteredPortfolio}
            currencyMode={filters.currencyMode}
            emptyMessage="No positions match the current filter."
            isLoading={dashboardState === "loading" && !hasPositions}
            highlightedTicker={highlightedTicker}
          />
        </>
      )}
    </PageShell>
  )
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<div className="px-4 py-6 text-sm text-muted-foreground md:px-8">Preparing dashboard...</div>}>
      <DashboardContent />
    </Suspense>
  )
}

