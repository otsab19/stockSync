"use client"

import Link from "next/link"
import { Suspense, useCallback, useEffect, useMemo, useState } from "react"
import { ChartCandlestick, RefreshCw } from "lucide-react"
import { PageShell } from "@/components/app/page-shell"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { FilterBar } from "@/components/dashboard/filter-bar"
import { KpiStrip } from "@/components/dashboard/kpi-strip"
import { PortfolioCharts } from "@/components/dashboard/portfolio-charts"
import { PortfolioTable } from "@/components/dashboard/portfolio-table"
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
        refresh: true,
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
    return filterActivity(baseActivity, filteredPortfolio)
  }, [filteredPortfolio, portfolioResponse])
  const filteredInsights = useMemo(() => {
    const baseInsights = portfolioResponse?.status === "ok" ? portfolioResponse.insights : null

    if (!hasInsightAffectingFilters(filters) && baseInsights) {
      return baseInsights
    }

    return buildInsights(filteredPortfolio, filteredActivity)
  }, [filteredActivity, filters, filteredPortfolio, portfolioResponse])
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
      <div className="flex flex-wrap items-center justify-between gap-3 px-1">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          {isRefreshing && <p className="mt-0.5 text-xs text-muted-foreground">Syncing latest broker data...</p>}
          {hasPositions && (
            <p className="mt-0.5 text-sm text-muted-foreground">
              {totalValueLabel} • {totalReturnLabel}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
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
        </div>
      </div>

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
          <KpiStrip
            insights={filteredInsights}
            currencyMode={filters.currencyMode}
            activeBrokerFilterLabel={activeBrokerFilterLabel}
            totalValueLabel={totalValueLabel || "—"}
            totalReturnLabel={totalReturnLabel || "—"}
            onFocusAlerts={() => setFilters((current) => ({ ...current, plStatus: "near-alert" }))}
          />

          <FilterBar filters={filters} availableBrokers={availableBrokers} onFiltersChange={setFilters} />

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

