"use client"

import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { Suspense, useCallback, useEffect, useMemo, useState } from "react"
import { ArrowUpRight, ChartCandlestick, RefreshCw } from "lucide-react"
import { PageHeader, PageShell } from "@/components/app/page-shell"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { FilterBar } from "@/components/dashboard/filter-bar"
import { KpiStrip } from "@/components/dashboard/kpi-strip"
import { PortfolioCharts } from "@/components/dashboard/portfolio-charts"
import { PortfolioTable } from "@/components/dashboard/portfolio-table"
import { buildInsights, defaultFilterState, filterActivity, filterPortfolio, formatMoney, getDisplayProfit } from "@/lib/dashboard/filter-engine"
import type { FilterState } from "@/lib/dashboard/filter-engine"
import { createClientPortfolioRepository } from "@/lib/portfolio/client-factory"
import type { CurrencyMode, PortfolioApiResponse, PortfolioDataMeta, PortfolioPosition } from "@/types/portfolio"

type DashboardState = "loading" | "ready" | "setup_required" | "unauthorized" | "client_only" | "error"

const stateCopy: Record<Exclude<DashboardState, "loading" | "ready">, string> = {
  setup_required: "Supabase is not configured yet. Add your environment variables to unlock live data.",
  unauthorized: "Sign in support is not wired up yet, so the dashboard cannot fetch user-specific data.",
  client_only: "This app is using browser-local portfolio storage. Holdings work in this mode, but background push notifications cannot be delivered after the app is closed because there is no server-owned alert pipeline.",
  error: "The portfolio API returned an error. Check the server logs and your Supabase tables.",
}

const backendLabels = {
  browser: "Browser backend",
  supabase: "Supabase backend",
} as const

const sourceLabels = {
  browser_local: "IndexedDB source",
  server: "Server route source",
} as const

const sourceKindLabels = {
  api_sync: "Broker API sync",
  csv_import: "Local broker data",
  sample: "Broker data",
} as const

const refreshIntervalOptions = [0, 30, 60, 300] as const

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

function formatDataMeta(meta: PortfolioDataMeta | null | undefined) {
  if (!meta) {
    return null
  }

  if (meta.brokerDetails && meta.brokerDetails.length > 0) {
    return meta.brokerDetails
      .map((detail) => {
        const parts: string[] = [detail.broker === "t212" ? "Trading 212" : detail.broker === "etoro" ? "eToro" : detail.broker]

        parts.push(sourceKindLabels[detail.sourceKind])

        if (detail.fileName) {
          parts.push(detail.fileName)
        }

        if (detail.lastSyncedAt) {
          parts.push(new Date(detail.lastSyncedAt).toLocaleString())
        }

        return parts.join(" • ")
      })
      .join(" | ")
  }

  const details: string[] = [sourceKindLabels[meta.sourceKind]]

  if (meta.broker === "t212") {
    details.push("Trading 212")
  } else if (meta.broker === "etoro") {
    details.push("eToro")
  }

  if (meta.fileName) {
    details.push(meta.fileName)
  }

  if (meta.lastSyncedAt) {
    details.push(new Date(meta.lastSyncedAt).toLocaleString())
  }

  return details.join(" • ")
}

function DashboardContent() {
  const searchParams = useSearchParams()
  const [portfolio, setPortfolio] = useState<PortfolioPosition[]>([])
  const [portfolioResponse, setPortfolioResponse] = useState<PortfolioApiResponse | null>(null)
  const [dashboardState, setDashboardState] = useState<DashboardState>("loading")
  const [message, setMessage] = useState<string | null>(null)
  const [filters, setFilters] = useState(defaultFilterState)
  const [highlightedTicker, setHighlightedTicker] = useState<string | null>(null)
  const [refreshIntervalSeconds, setRefreshIntervalSeconds] = useState<(typeof refreshIntervalOptions)[number]>(0)
  const [isRefreshing, setIsRefreshing] = useState(false)

  const fetchPortfolio = useCallback(async (reason: "initial" | "manual" | "interval" = "manual") => {
    try {
      if (reason !== "initial") {
        setIsRefreshing(true)
      }

      const repository = createClientPortfolioRepository()
      const data: PortfolioApiResponse = await repository.getPortfolio({
        refresh: reason === "manual",
        includeActivity: false,
      })

      setPortfolioResponse(data)
      setPortfolio(data.portfolio)

      if (data.status === "ok") {
        setDashboardState("ready")
        setMessage(data.message ?? null)
        return
      }

      setDashboardState(data.status)
      setMessage(data.message)
    } catch (error) {
      console.error("Failed to fetch portfolio:", error)
      setPortfolioResponse(null)
      setPortfolio([])
      setDashboardState("error")
      setMessage("Unable to load portfolio data from the selected backend.")
    } finally {
      setIsRefreshing(false)
    }
  }, [])

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void fetchPortfolio("initial")
    }, 0)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [fetchPortfolio])

  useEffect(() => {
    if (refreshIntervalSeconds === 0) {
      return
    }

    const intervalId = window.setInterval(() => {
      void fetchPortfolio("interval")
    }, refreshIntervalSeconds * 1000)

    return () => {
      window.clearInterval(intervalId)
    }
  }, [fetchPortfolio, refreshIntervalSeconds])

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
  const statusMessage = message ?? (dashboardState === "loading" || dashboardState === "ready" ? null : stateCopy[dashboardState])
  const analyticsView = searchParams.get("view") === "analytics"
  const activeBrokerFilterLabel = filters.brokers.length === 0 ? "all brokers" : filters.brokers.join(" + ")
  const totalValueLabel = formatMixedCurrencyTotals(filteredPortfolio, filters.currencyMode)
  const totalReturnLabel = formatMixedProfitTotals(filteredPortfolio, filters.currencyMode)
  const backendLabel = portfolioResponse ? backendLabels[portfolioResponse.backend] : null
  const sourceLabel = portfolioResponse ? sourceLabels[portfolioResponse.source] : null
  const dataMetaLabel = formatDataMeta(portfolioResponse?.meta)
  const refreshModeLabel = refreshIntervalSeconds === 0 ? "Manual refresh only" : `Refresh every ${refreshIntervalSeconds}s`
  const isEmptyState = dashboardState === "ready" && !hasPositions
  const datasetSourceLabel = portfolioResponse?.meta ? sourceKindLabels[portfolioResponse.meta.sourceKind] : "Awaiting portfolio load"
  const activeViewLabel = analyticsView ? "Analytics" : "Overview"
  const brokerCount = availableBrokers.length

  return (
    <PageShell>
      <PageHeader
        eyebrow="Workspace"
        title="Portfolio dashboard"
        description="Track live holdings, spot alert risk faster, and move between overview and analytics without losing the shell context."
        actions={(
          <>
            <Button variant="outline" onClick={() => void fetchPortfolio("manual")} disabled={isRefreshing} className="gap-2 rounded-xl border-white/10 bg-white/[0.03] px-3">
              <RefreshCw className={isRefreshing ? "size-4 animate-spin" : "size-4"} />
              {isRefreshing ? "Refreshing..." : "Refresh now"}
            </Button>
            <Link
              href="/integrations"
              className="inline-flex h-8 items-center justify-center gap-2 rounded-xl border border-primary/20 bg-primary/10 px-3 text-sm font-medium text-primary transition-colors hover:bg-primary/14"
            >
              Manage connections
              <ArrowUpRight className="size-4" />
            </Link>
          </>
        )}
        badges={(
          <>
            <Badge variant="outline">{portfolio.length} positions</Badge>
            <Badge variant="outline">{activeViewLabel}</Badge>
            {backendLabel ? <Badge variant="outline">{backendLabel}</Badge> : null}
            {sourceLabel ? <Badge variant="outline">{sourceLabel}</Badge> : null}
          </>
        )}
      />

      <section className="grid gap-4 xl:grid-cols-[1.6fr_0.9fr]">
        <Card className="border-white/10 bg-[linear-gradient(145deg,rgba(14,165,233,0.06),rgba(16,185,129,0.08),transparent_72%)]">
          <CardHeader className="gap-4">
            <div>
              <CardTitle className="text-2xl sm:text-[2rem]">Workspace pulse</CardTitle>
              <CardDescription className="mt-2 max-w-3xl text-sm">
                The current dashboard blends Trading 212 and eToro positions into one filtered view so the table, charts, and alert states stay in sync.
              </CardDescription>
            </div>
            {dataMetaLabel ? <p className="text-xs text-muted-foreground">Current dataset: {dataMetaLabel}</p> : null}
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-muted-foreground">Broker coverage</p>
              <p className="mt-3 text-2xl font-semibold tracking-tight">{brokerCount || 0}</p>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">
                {brokerCount > 0 ? `${availableBrokers.map((broker) => broker.label).join(" • ")}` : "No brokers loaded yet."}
              </p>
            </div>
            <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-muted-foreground">Current focus</p>
              <p className="mt-3 text-2xl font-semibold tracking-tight">{activeViewLabel}</p>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">
                Filters are currently focused on {activeBrokerFilterLabel}.
              </p>
            </div>
            <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-muted-foreground">Dataset source</p>
              <p className="mt-3 text-2xl font-semibold tracking-tight">{datasetSourceLabel}</p>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">{refreshModeLabel}</p>
            </div>
          </CardContent>
        </Card>

        <Card size="sm" className="border-white/10">
          <CardHeader>
            <CardTitle>Data status</CardTitle>
            <CardDescription>
              {dashboardState === "loading"
                ? "Loading the selected portfolio backend."
                : statusMessage ?? "Portfolio data loaded successfully."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-muted-foreground">
            {backendLabel || sourceLabel ? (
              <div className="flex flex-wrap gap-2">
                {backendLabel ? <Badge variant="secondary">{backendLabel}</Badge> : null}
                {sourceLabel ? <Badge variant="secondary">{sourceLabel}</Badge> : null}
                {portfolioResponse?.meta ? <Badge variant="secondary">{sourceKindLabels[portfolioResponse.meta.sourceKind]}</Badge> : null}
              </div>
            ) : null}
            {dataMetaLabel ? <p>{dataMetaLabel}</p> : null}
            <label className="space-y-2 text-xs">
              <span className="font-medium uppercase tracking-[0.16em] text-muted-foreground">Dashboard polling</span>
              <div className="flex items-center gap-2 rounded-2xl border border-white/8 bg-white/[0.03] px-3 py-2.5">
                <select
                  value={refreshIntervalSeconds}
                  onChange={(event) => setRefreshIntervalSeconds(Number(event.target.value) as (typeof refreshIntervalOptions)[number])}
                  className="w-full bg-transparent text-sm outline-none"
                >
                  {refreshIntervalOptions.map((option) => (
                    <option key={option} value={option}>
                      {option === 0 ? "Off" : `${option}s`}
                    </option>
                  ))}
                </select>
              </div>
            </label>
            <p className="text-xs">{refreshModeLabel}</p>
            <div className="flex flex-wrap gap-3">
              <Link href="/integrations" className="font-medium text-primary transition-colors hover:text-primary/80">
                Manage connections
              </Link>
              <Link href="/settings" className="font-medium text-primary transition-colors hover:text-primary/80">
                Open settings
              </Link>
            </div>
          </CardContent>
        </Card>
      </section>

      <Card className="border-white/10 bg-[linear-gradient(145deg,rgba(96,165,250,0.08),rgba(167,139,250,0.08),transparent_72%)]">
        <CardHeader className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <CardTitle>Need trade history and buys vs sells?</CardTitle>
            <CardDescription>
              Open the dedicated history workspace for detailed bought/sold activity, richer flow charts, advanced filters, and the transaction table behind your portfolio moves.
            </CardDescription>
          </div>
          <Link
            href="/dashboard/history"
            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-primary/20 bg-primary/10 px-4 text-sm font-medium text-primary transition-colors hover:bg-primary/14"
          >
            <ChartCandlestick className="size-4" />
            Open history dashboard
          </Link>
        </CardHeader>
      </Card>

      {isEmptyState ? (
        <Card className="border-dashed border-white/12 bg-white/[0.02]">
          <CardHeader>
            <CardTitle>No holdings loaded</CardTitle>
            <CardDescription>Connect Trading 212 or eToro through broker integrations to populate the dashboard.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-3 text-sm text-muted-foreground">
            <Link href="/integrations" className="font-medium text-primary transition-colors hover:text-primary/80">
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

          {analyticsView ? (
            <PortfolioCharts insights={filteredInsights} onHighlightAsset={setHighlightedTicker} />
          ) : (
            <>
              <PortfolioCharts insights={filteredInsights} onHighlightAsset={setHighlightedTicker} />
              <PortfolioTable
                portfolio={filteredPortfolio}
                currencyMode={filters.currencyMode}
                emptyMessage={statusMessage ?? "No positions match the current filter combination."}
                isLoading={dashboardState === "loading" && !hasPositions}
                highlightedTicker={highlightedTicker}
              />
            </>
          )}

          {analyticsView ? (
            <PortfolioTable
              portfolio={filteredPortfolio}
              currencyMode={filters.currencyMode}
              emptyMessage={statusMessage ?? "No positions match the current filter combination."}
              isLoading={dashboardState === "loading" && !hasPositions}
              highlightedTicker={highlightedTicker}
            />
          ) : null}
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

