"use client"

import Link from "next/link"
import { useCallback, useEffect, useMemo, useState } from "react"
import { Fragment } from "react"
import { ArrowDownUp, ChevronDown, ChevronRight, Download, RefreshCw, TrendingUp, TrendingDown, BarChart3, List } from "lucide-react"
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { PageHeader, PageShell } from "@/components/app/page-shell"
import { BrokerFreshnessList, FreshnessBadge } from "@/components/dashboard/freshness-badge"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { formatMoney } from "@/lib/dashboard/filter-engine"
import { getActivitySide } from "@/lib/dashboard/activity-view"
import {
  buildBrokerPerformanceBreakdown,
  buildCumulativeRealisedPlSeries,
  buildHistoryPerformanceMetrics,
  buildMonthlyRealisedPl,
  buildTickerTradeSummaries,
} from "@/lib/dashboard/history-metrics"
import { buildTradeCycles, groupTradeCycles, type TradeCycleGroupBy } from "@/lib/dashboard/trade-cycles"
import { buildPortfolioAnalytics } from "@/lib/dashboard/portfolio-analytics"
import { createClientPortfolioRepository } from "@/lib/portfolio/client-factory"
import type { BrokerId, PortfolioActivityEvent, PortfolioApiResponse } from "@/types/portfolio"

type HistoryDashboardState = "loading" | "ready" | "setup_required" | "unauthorized" | "client_only" | "error"
type ActivityFilterType = "all" | "buy" | "sell"
type ActivityTimeRange = "7d" | "30d" | "90d" | "ytd" | "all"
type ActivitySortBy = "timestamp" | "grossAmountGbp" | "shares" | "ticker"
type ViewMode = "trades" | "by-ticker"
type QuickFilter = "none" | "biggest" | "most-traded" | "profitable" | "loss-making"

type HistoryFilterState = {
  searchQuery: string
  brokers: BrokerId[]
  activityType: ActivityFilterType
  timeRange: ActivityTimeRange
  sortBy: ActivitySortBy
  sortOrder: "asc" | "desc"
  quickFilter: QuickFilter
}

const defaultHistoryFilters: HistoryFilterState = {
  searchQuery: "",
  brokers: [],
  activityType: "all",
  timeRange: "all",
  sortBy: "timestamp",
  sortOrder: "desc",
  quickFilter: "none",
}

const activityTypeLabels: Record<ActivityFilterType, string> = {
  all: "All trades",
  buy: "Buys",
  sell: "Sells",
}

const timeRangeLabels: Record<ActivityTimeRange, string> = {
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  "90d": "Last 90 days",
  ytd: "Year to date",
  all: "All time",
}

const quickFilterLabels: Record<QuickFilter, string> = {
  none: "All",
  biggest: "Biggest trades",
  "most-traded": "Most traded",
  profitable: "Profitable only",
  "loss-making": "Loss-making only",
}

function hasActiveHistoryFilters(filters: HistoryFilterState) {
  return filters.searchQuery.trim().length > 0
    || filters.brokers.length > 0
    || filters.activityType !== defaultHistoryFilters.activityType
    || filters.timeRange !== defaultHistoryFilters.timeRange
    || filters.sortBy !== defaultHistoryFilters.sortBy
    || filters.sortOrder !== defaultHistoryFilters.sortOrder
    || filters.quickFilter !== defaultHistoryFilters.quickFilter
}

const brokerColours = ["#5eead4", "#60a5fa", "#f59e0b", "#a78bfa", "#f472b6", "#22d3ee"]

function getTimeRangeStart(range: ActivityTimeRange) {
  const now = new Date()
  switch (range) {
    case "7d": { const d = new Date(now); d.setDate(d.getDate() - 7); return d }
    case "30d": { const d = new Date(now); d.setDate(d.getDate() - 30); return d }
    case "90d": { const d = new Date(now); d.setDate(d.getDate() - 90); return d }
    case "ytd": return new Date(now.getFullYear(), 0, 1)
    case "all": default: return null
  }
}

function dedupeActivityEvents(activity: PortfolioActivityEvent[]) {
  const seen = new Set<string>()
  return activity.filter((event) => {
    if (seen.has(event.id)) return false
    seen.add(event.id)
    return true
  })
}

function buildHistoryTradeStats(activity: PortfolioActivityEvent[]) {
  const events = dedupeActivityEvents(activity)
  const etoroPositionIds = new Set<string>()
  let nonEtoroTradeCount = 0

  events.forEach((event) => {
    if (event.broker === "etoro") {
      const positionId = event.id.split(":")[1]
      if (positionId) etoroPositionIds.add(positionId)
      return
    }

    nonEtoroTradeCount += 1
  })

  return {
    completedTradeCount: etoroPositionIds.size + nonEtoroTradeCount,
    orderLegCount: events.length,
  }
}

function filterHistoryActivity(activity: PortfolioActivityEvent[], filters: HistoryFilterState) {
  const search = filters.searchQuery.trim().toLowerCase()
  const rangeStart = getTimeRangeStart(filters.timeRange)

  const filtered = activity.filter((event) => {
    const eventTimestamp = new Date(event.timestamp)
    const matchesRange = !rangeStart || eventTimestamp >= rangeStart
    const matchesType = filters.activityType === "all" || getActivitySide(event) === filters.activityType
    const matchesBroker = filters.brokers.length === 0 || filters.brokers.includes(event.broker)
    const matchesSearch = !search
      || event.ticker.toLowerCase().includes(search)
      || event.companyName.toLowerCase().includes(search)
      || event.brokerLabel.toLowerCase().includes(search)
      || event.orderType?.toLowerCase().includes(search)
    return matchesRange && matchesType && matchesBroker && matchesSearch
  })

  return filtered.sort((left, right) => {
    const direction = filters.sortOrder === "asc" ? 1 : -1
    switch (filters.sortBy) {
      case "grossAmountGbp": return (left.grossAmountGbp - right.grossAmountGbp) * direction
      case "shares": return (left.shares - right.shares) * direction
      case "ticker": return left.ticker.localeCompare(right.ticker) * direction
      case "timestamp": default: return (new Date(left.timestamp).getTime() - new Date(right.timestamp).getTime()) * direction
    }
  })
}

function formatShortDate(value: string) {
  return new Date(value).toLocaleDateString("en-GB", { month: "short", day: "numeric" })
}

function formatLongDateTime(value: string) {
  return new Date(value).toLocaleString("en-GB", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
}

function downloadActivityCsv(activity: PortfolioActivityEvent[]) {
  const rows = [
    ["Date", "Broker", "Ticker", "Company", "Side", "Shares", "Price", "Currency", "Amount (GBP)", "Realised P/L (GBP)", "Order type"],
  ]
  for (const event of activity) {
    const side = getActivitySide(event)
    rows.push([
      formatLongDateTime(event.timestamp),
      event.brokerLabel,
      event.ticker,
      event.companyName,
      side,
      String(event.shares),
      String(event.price),
      event.nativeCurrency,
      event.grossAmountGbp.toFixed(2),
      event.realisedProfitGbp !== undefined ? event.realisedProfitGbp.toFixed(2) : "",
      event.orderType ?? "",
    ])
  }
  const csv = rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, "'")}"`).join(",")).join("\n")
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = `trade-history-${new Date().toISOString().slice(0, 10)}.csv`
  link.click()
  URL.revokeObjectURL(url)
}

function formatSignedMoney(value: number) {
  return `${value >= 0 ? "+" : ""}${formatMoney(value, "GBP")}`
}

function formatTradeShares(value: number) {
  return new Intl.NumberFormat("en-GB", { minimumFractionDigits: 0, maximumFractionDigits: 8 }).format(value)
}

function formatTradePrice(value: number, currency: "GBP" | "USD") {
  const absoluteValue = Math.abs(value)
  const maximumFractionDigits = absoluteValue >= 100 ? 2 : absoluteValue >= 1 ? 4 : 6
  return new Intl.NumberFormat("en-GB", { style: "currency", currency, minimumFractionDigits: 2, maximumFractionDigits }).format(value)
}

function formatMonth(value: string) {
  const [year, month] = value.split("-")
  const d = new Date(Number(year), Number(month) - 1, 1)
  return d.toLocaleDateString("en-GB", { month: "short", year: "2-digit" })
}

function shouldShowCompanyName(event: PortfolioActivityEvent) {
  return event.companyName.trim().toUpperCase() !== event.ticker.trim().toUpperCase()
}

function HistoryTradeCyclesTable({ activity }: { activity: PortfolioActivityEvent[] }) {
  const [groupBy, setGroupBy] = useState<TradeCycleGroupBy>("ticker")
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())

  const tradeCycles = useMemo(() => buildTradeCycles(activity), [activity])
  const tableGroups = useMemo(
    () => groupTradeCycles(tradeCycles, groupBy),
    [groupBy, tradeCycles]
  )

  function toggleGroup(key: string) {
    setCollapsedGroups((previous) => {
      const next = new Set(previous)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function renderPlCell(value: number | null) {
    if (value === null) return <span className="text-xs text-muted-foreground">—</span>
    return (
      <span className={`text-xs font-semibold tabular-nums ${value >= 0 ? "text-emerald-400" : "text-red-400"}`}>
        {formatSignedMoney(value)}
      </span>
    )
  }

  function renderGroupHeader(group: ReturnType<typeof groupTradeCycles>[number]) {
    const showPl = group.key === "sells" || groupBy === "ticker" || groupBy === "broker"
    return (
      <TableRow className="cursor-pointer bg-white/[0.03] hover:bg-white/[0.05]" onClick={() => toggleGroup(group.key)}>
        <TableCell colSpan={8} className="py-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              {collapsedGroups.has(group.key) ? <ChevronRight className="size-3.5" /> : <ChevronDown className="size-3.5" />}
              <span className="text-sm font-semibold">{group.label}</span>
              {group.detail ? <span className="text-xs text-muted-foreground">· {group.detail}</span> : null}
            </div>
            {showPl ? (
              <div className="text-xs">
                <span className="text-muted-foreground">{groupBy === "ticker" ? "Stock P/L " : "Group P/L "}</span>
                {renderPlCell(group.netPlGbp)}
              </div>
            ) : null}
          </div>
        </TableCell>
      </TableRow>
    )
  }

  return (
    <Card className="border-white/10">
      <CardHeader className="flex flex-row items-center justify-between gap-3 pb-3">
        <div>
          <CardTitle className="text-base">Transactions ({activity.length} legs · {tradeCycles.length} round trips)</CardTitle>
          <CardDescription>Buy/sell pairs with P/L per round trip.</CardDescription>
        </div>
        <select
          value={groupBy}
          onChange={(event) => {
            setGroupBy(event.target.value as TradeCycleGroupBy)
            setCollapsedGroups(new Set())
          }}
          className="rounded-lg border border-white/10 bg-white/[0.03] px-2 py-1 text-xs outline-none"
        >
          <option value="ticker">Group by stock</option>
          <option value="broker">Group by broker</option>
          <option value="type">Group by buy/sell</option>
          <option value="none">No grouping</option>
        </select>
      </CardHeader>
      <CardContent className="p-0">
        <div className="max-h-[65vh] overflow-auto">
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-card">
              <TableRow>
                <TableHead className="min-w-[50px]">Side</TableHead>
                <TableHead className="min-w-[120px]">Date</TableHead>
                <TableHead className="min-w-[70px]">Broker</TableHead>
                <TableHead className="min-w-[80px]">Ticker</TableHead>
                <TableHead className="min-w-[80px] text-right">Shares</TableHead>
                <TableHead className="min-w-[80px] text-right">Price</TableHead>
                <TableHead className="min-w-[90px] text-right">Amount</TableHead>
                <TableHead className="min-w-[90px] text-right">P/L</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tableGroups.map((group) => (
                <Fragment key={group.key}>
                  {groupBy !== "none" ? renderGroupHeader(group) : null}
                  {(groupBy === "none" || !collapsedGroups.has(group.key)) && group.cycles.flatMap((cycle) => {
                    const rows = []
                    cycle.buys.forEach((buy, buyIndex) => {
                      rows.push(
                        <TableRow key={`${cycle.id}:buy:${buyIndex}`} className="bg-white/[0.01]">
                          <TableCell><span className="text-xs font-medium text-emerald-400">Buy</span></TableCell>
                          <TableCell><span className="text-xs">{formatLongDateTime(buy.timestamp)}</span></TableCell>
                          <TableCell><span className="text-xs text-muted-foreground">{cycle.brokerLabel}</span></TableCell>
                          <TableCell>
                            <span className="font-medium text-xs">{cycle.ticker}</span>
                            {shouldShowCompanyName(buy) ? (
                              <span className="ml-1 text-[0.6rem] text-muted-foreground">{buy.companyName}</span>
                            ) : null}
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-xs">{formatTradeShares(buy.shares)}</TableCell>
                          <TableCell className="text-right tabular-nums text-xs">{formatTradePrice(buy.price, buy.nativeCurrency)}</TableCell>
                          <TableCell className="text-right tabular-nums text-xs">{formatMoney(buy.grossAmountGbp, "GBP")}</TableCell>
                          <TableCell />
                        </TableRow>
                      )
                    })
                    if (cycle.sell) {
                      rows.push(
                        <TableRow key={`${cycle.id}:sell`} className="border-b border-white/[0.06] bg-white/[0.01]">
                          <TableCell><span className="text-xs font-medium text-red-400">Sell</span></TableCell>
                          <TableCell><span className="text-xs">{formatLongDateTime(cycle.sell.timestamp)}</span></TableCell>
                          <TableCell><span className="text-xs text-muted-foreground">{cycle.brokerLabel}</span></TableCell>
                          <TableCell>
                            <span className="font-medium text-xs">{cycle.ticker}</span>
                            {shouldShowCompanyName(cycle.sell) ? (
                              <span className="ml-1 text-[0.6rem] text-muted-foreground">{cycle.sell.companyName}</span>
                            ) : null}
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-xs">{formatTradeShares(cycle.sell.shares)}</TableCell>
                          <TableCell className="text-right tabular-nums text-xs">{formatTradePrice(cycle.sell.price, cycle.sell.nativeCurrency)}</TableCell>
                          <TableCell className="text-right tabular-nums text-xs">{formatMoney(cycle.sell.grossAmountGbp, "GBP")}</TableCell>
                          <TableCell className="text-right">{renderPlCell(cycle.plGbp)}</TableCell>
                        </TableRow>
                      )
                    }
                    return rows
                  })}
                </Fragment>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  )
}

export default function DashboardHistoryPage() {
  const [portfolioResponse, setPortfolioResponse] = useState<PortfolioApiResponse | null>(null)
  const [, setDashboardState] = useState<HistoryDashboardState>("loading")
  const [, setMessage] = useState<string | null>(null)
  const [filters, setFilters] = useState(defaultHistoryFilters)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [viewMode, setViewMode] = useState<ViewMode>("trades")

  const fetchPortfolio = useCallback(async ({ refresh = false }: { refresh?: boolean } = {}) => {
    try {
      if (refresh) setIsRefreshing(true)
      const repository = createClientPortfolioRepository()
      const data = await repository.getPortfolio({ refresh, includeActivity: true, preferCache: !refresh })
      setPortfolioResponse(data)
      if (data.status === "ok") { setDashboardState("ready"); setMessage(data.message ?? null); return }
      setDashboardState(data.status)
      setMessage(data.message)
    } catch (error) {
      console.error("Failed to fetch portfolio history:", error)
      setPortfolioResponse(null)
      setDashboardState("error")
      setMessage("Unable to load portfolio history from the selected backend.")
    } finally {
      if (refresh) setIsRefreshing(false)
    }
  }, [])

  useEffect(() => {
    const timeoutId = window.setTimeout(() => { void fetchPortfolio() }, 0)
    return () => { window.clearTimeout(timeoutId) }
  }, [fetchPortfolio])

  const portfolio = useMemo(() => portfolioResponse?.status === "ok" ? portfolioResponse.portfolio : [], [portfolioResponse])
  const rawActivity = useMemo(() => {
    const activity = portfolioResponse?.status === "ok"
      ? (portfolioResponse.activity ?? portfolioResponse.insights.activity ?? [])
      : []
    return dedupeActivityEvents(activity)
  }, [portfolioResponse])
  const tradeStats = useMemo(() => buildHistoryTradeStats(rawActivity), [rawActivity])
  const filteredPortfolio = useMemo(
    () => filters.brokers.length === 0
      ? portfolio
      : portfolio.filter((position) => filters.brokers.includes(position.broker)),
    [filters.brokers, portfolio]
  )
  const availableBrokers = useMemo(
    () => Array.from(new Map<BrokerId, { broker: BrokerId; label: string }>([
      ...portfolio.map((p) => [p.broker, { broker: p.broker, label: p.brokerLabel }] as const),
      ...rawActivity.map((e) => [e.broker, { broker: e.broker, label: e.brokerLabel }] as const),
    ]).values()),
    [portfolio, rawActivity]
  )
  const filteredActivity = useMemo(() => filterHistoryActivity(rawActivity, filters), [filters, rawActivity])
  const tickerSummaries = useMemo(() => buildTickerTradeSummaries(filteredActivity), [filteredActivity])

  // Apply quick filters
  const displayActivity = useMemo(() => {
    if (filters.quickFilter === "none") return filteredActivity
    if (filters.quickFilter === "biggest") return [...filteredActivity].sort((a, b) => b.grossAmountGbp - a.grossAmountGbp).slice(0, 20)
    if (filters.quickFilter === "most-traded") {
      const countMap = new Map<string, number>()
      filteredActivity.forEach((e) => countMap.set(e.ticker, (countMap.get(e.ticker) ?? 0) + 1))
      const topTickers = Array.from(countMap.entries()).sort(([, a], [, b]) => b - a).slice(0, 5).map(([t]) => t)
      return filteredActivity.filter((e) => topTickers.includes(e.ticker))
    }
    if (filters.quickFilter === "profitable") {
      const profitableTickers = new Set(tickerSummaries.filter((s) => s.netPlGbp > 0).map((s) => `${s.ticker}:${s.broker}`))
      return filteredActivity.filter((e) => profitableTickers.has(`${e.ticker}:${e.broker}`))
    }
    if (filters.quickFilter === "loss-making") {
      const lossTickers = new Set(tickerSummaries.filter((s) => s.netPlGbp < 0).map((s) => `${s.ticker}:${s.broker}`))
      return filteredActivity.filter((e) => lossTickers.has(`${e.ticker}:${e.broker}`))
    }
    return filteredActivity
  }, [filteredActivity, filters.quickFilter, tickerSummaries])

  const brokerAccounts = useMemo(
    () => (portfolioResponse?.meta?.brokerDetails ?? []).map((detail) => detail.account).filter(Boolean),
    [portfolioResponse]
  )
  const preferAccountSnapshots = filters.timeRange === "all"

  const performanceMetrics = useMemo(
    () => buildHistoryPerformanceMetrics(filteredPortfolio, filteredActivity, {
      brokerAccounts,
      preferAccountSnapshots,
    }),
    [brokerAccounts, filteredActivity, filteredPortfolio, preferAccountSnapshots]
  )
  const cumulativePlSeries = useMemo(() => buildCumulativeRealisedPlSeries(filteredActivity), [filteredActivity])
  const brokerBreakdown = useMemo(
    () => buildBrokerPerformanceBreakdown(filteredPortfolio, filteredActivity, {
      brokerAccounts,
      preferAccountSnapshots,
    }),
    [brokerAccounts, filteredActivity, filteredPortfolio, preferAccountSnapshots]
  )
  const monthlyPl = useMemo(() => buildMonthlyRealisedPl(filteredActivity), [filteredActivity])
  const closedTradeCycles = useMemo(
    () => buildTradeCycles(filteredActivity).filter((cycle) => cycle.sell?.realisedProfitGbp !== undefined),
    [filteredActivity]
  )

  // Analytics computations
  const topGainers = useMemo(
    () => tickerSummaries.filter((s) => s.closedTradeCount > 0).sort((a, b) => b.netPlGbp - a.netPlGbp).slice(0, 5),
    [tickerSummaries]
  )
  const topLosers = useMemo(
    () => tickerSummaries.filter((s) => s.closedTradeCount > 0 && s.netPlGbp < 0).sort((a, b) => a.netPlGbp - b.netPlGbp).slice(0, 5),
    [tickerSummaries]
  )
  const mostTraded = useMemo(() => [...tickerSummaries].sort((a, b) => b.tradeCount - a.tradeCount).slice(0, 5), [tickerSummaries])

  const bestClosedTrade = closedTradeCycles.length > 0
    ? closedTradeCycles.reduce((best, cycle) => ((cycle.plGbp ?? 0) > (best.plGbp ?? 0) ? cycle : best))
    : null
  const worstClosedTrade = closedTradeCycles.length > 0
    ? closedTradeCycles.reduce((worst, cycle) => ((cycle.plGbp ?? 0) < (worst.plGbp ?? 0) ? cycle : worst))
    : null

  const { open: openMetrics, history: historyMetrics } = performanceMetrics

  const portfolioAnalytics = useMemo(
    () => buildPortfolioAnalytics(rawActivity, openMetrics.valueGbp),
    [rawActivity, openMetrics.valueGbp]
  )

  const avgTradeSizeGbp = displayActivity.length === 0
    ? 0
    : displayActivity.reduce((sum, e) => sum + e.grossAmountGbp, 0) / displayActivity.length

  const hasAnyActivity = rawActivity.length > 0
  const hasFilteredResults = displayActivity.length > 0
  const activeHistoryFilters = hasActiveHistoryFilters(filters)

  return (
    <PageShell>
      <PageHeader
        eyebrow="History"
        title="Trade history"
        description={`Showing ${displayActivity.length} of ${tradeStats.completedTradeCount} completed trade${tradeStats.completedTradeCount === 1 ? "" : "s"} (${tradeStats.orderLegCount} order legs). P/L combines broker-reported realised values with FIFO estimates where needed.`}
        badges={
          <>
            <FreshnessBadge meta={portfolioResponse?.meta} source={portfolioResponse?.source ?? "server"} />
            <BrokerFreshnessList meta={portfolioResponse?.meta} />
          </>
        }
        actions={
          <div className="flex gap-2">
            {displayActivity.length > 0 && (
              <Button variant="outline" size="sm" onClick={() => downloadActivityCsv(displayActivity)} className="gap-2 rounded-xl border-white/10 bg-white/[0.03]">
                <Download className="size-4" />
                Export CSV
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => void fetchPortfolio({ refresh: true })} disabled={isRefreshing} className="gap-2 rounded-xl border-white/10 bg-white/[0.03]">
              <RefreshCw className={isRefreshing ? "size-4 animate-spin" : "size-4"} />
              {isRefreshing ? "Syncing..." : "Refresh"}
            </Button>
          </div>
        }
      />

      {/* KPI Strip — open positions (live) + closed trade performance (filtered history) */}
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-muted-foreground">Open value</p>
          <p className="mt-2 text-2xl font-semibold tracking-tight">{formatMoney(openMetrics.valueGbp, "GBP")}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {openMetrics.positionCount} open position{openMetrics.positionCount === 1 ? "" : "s"} across {brokerBreakdown.length} broker{brokerBreakdown.length === 1 ? "" : "s"}
          </p>
        </div>
        <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-muted-foreground">Unrealised P/L</p>
          <p className={`mt-2 text-2xl font-semibold tracking-tight ${openMetrics.unrealisedPlGbp >= 0 ? "text-emerald-400" : "text-red-400"}`}>
            {formatSignedMoney(openMetrics.unrealisedPlGbp)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {openMetrics.unrealisedReturnPercent >= 0 ? "+" : ""}{openMetrics.unrealisedReturnPercent.toFixed(1)}% on {formatMoney(openMetrics.costBasisGbp, "GBP")} cost basis
          </p>
        </div>
        <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-muted-foreground">Realised P/L</p>
          <p className={`mt-2 text-2xl font-semibold tracking-tight ${historyMetrics.realisedPlGbp >= 0 ? "text-emerald-400" : "text-red-400"}`}>
            {formatSignedMoney(historyMetrics.realisedPlGbp)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Closed trades only · {historyMetrics.closedTradeCount} round trip{historyMetrics.closedTradeCount === 1 ? "" : "s"} in range
          </p>
        </div>
        <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-muted-foreground">Capital in</p>
          <p className="mt-2 text-2xl font-semibold tracking-tight">{formatMoney(historyMetrics.totalBoughtGbp, "GBP")}</p>
          <p className="mt-1 text-xs text-muted-foreground">Gross buy volume in selected range</p>
        </div>
        <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-muted-foreground">Capital out</p>
          <p className="mt-2 text-2xl font-semibold tracking-tight">{formatMoney(historyMetrics.totalSoldGbp, "GBP")}</p>
          <p className="mt-1 text-xs text-muted-foreground">Gross sell volume in selected range</p>
        </div>
        <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-muted-foreground">Win rate</p>
          <p className="mt-2 text-2xl font-semibold tracking-tight">{historyMetrics.winRate.toFixed(1)}%</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {historyMetrics.closedTradeCount} closed round trip{historyMetrics.closedTradeCount === 1 ? "" : "s"}
          </p>
        </div>
      </section>

      {/* XIRR / TWR analytics row */}
      {(portfolioAnalytics.xirr !== null || portfolioAnalytics.twr !== null) && (
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-muted-foreground">XIRR</p>
            <p className={`mt-2 text-2xl font-semibold tracking-tight ${(portfolioAnalytics.xirrPercent ?? 0) >= 0 ? "text-emerald-400" : "text-red-400"}`}>
              {portfolioAnalytics.xirrPercent !== null
                ? `${portfolioAnalytics.xirrPercent >= 0 ? "+" : ""}${portfolioAnalytics.xirrPercent.toFixed(2)}%`
                : "—"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">Annualised return (all cash flows)</p>
          </div>
          <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-muted-foreground">TWR</p>
            <p className={`mt-2 text-2xl font-semibold tracking-tight ${(portfolioAnalytics.twrPercent ?? 0) >= 0 ? "text-emerald-400" : "text-red-400"}`}>
              {portfolioAnalytics.twrPercent !== null
                ? `${portfolioAnalytics.twrPercent >= 0 ? "+" : ""}${portfolioAnalytics.twrPercent.toFixed(2)}%`
                : "—"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">Time-weighted return (cumulative)</p>
          </div>
          <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-muted-foreground">Total invested</p>
            <p className="mt-2 text-2xl font-semibold tracking-tight">{formatMoney(portfolioAnalytics.totalInvested, "GBP")}</p>
            <p className="mt-1 text-xs text-muted-foreground">Gross buy volume across all history</p>
          </div>
          <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-muted-foreground">Holding period</p>
            <p className="mt-2 text-2xl font-semibold tracking-tight">
              {portfolioAnalytics.holdingPeriodDays !== null
                ? portfolioAnalytics.holdingPeriodDays >= 365
                  ? `${(portfolioAnalytics.holdingPeriodDays / 365).toFixed(1)}y`
                  : `${portfolioAnalytics.holdingPeriodDays}d`
                : "—"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">Since first recorded trade</p>
          </div>
        </section>
      )}

      {brokerBreakdown.length > 1 ? (
        <section className="grid gap-4 sm:grid-cols-2">
          {brokerBreakdown.map((broker) => (
            <div key={broker.broker} className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
              <p className="text-sm font-semibold">{broker.brokerLabel}</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <div>
                  <p className="text-[0.65rem] uppercase tracking-[0.18em] text-muted-foreground">Open value</p>
                  <p className="mt-1 text-sm font-semibold tabular-nums">{formatMoney(broker.openValueGbp, "GBP")}</p>
                </div>
                <div>
                  <p className="text-[0.65rem] uppercase tracking-[0.18em] text-muted-foreground">Unrealised</p>
                  <p className={`mt-1 text-sm font-semibold tabular-nums ${broker.unrealisedPlGbp >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                    {formatSignedMoney(broker.unrealisedPlGbp)}
                  </p>
                </div>
                <div>
                  <p className="text-[0.65rem] uppercase tracking-[0.18em] text-muted-foreground">Realised</p>
                  <p className={`mt-1 text-sm font-semibold tabular-nums ${broker.realisedPlGbp >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                    {formatSignedMoney(broker.realisedPlGbp)}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </section>
      ) : null}

      {/* Filters */}
      <Card className="border-white/10">
        <CardHeader className="gap-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <CardTitle>Filters & view</CardTitle>
              <CardDescription>
                Search, filter by time/broker/side, or use quick insights to slice your data.
              </CardDescription>
            </div>
            {activeHistoryFilters ? (
              <Button variant="ghost" size="sm" onClick={() => setFilters(defaultHistoryFilters)}>
                Reset filters
              </Button>
            ) : null}
          </div>
          <div className="grid gap-4 xl:grid-cols-[1.5fr_1fr_1fr_1fr]">
            <label className="space-y-2 text-sm">
              <span className="font-medium">Search</span>
              <input
                value={filters.searchQuery}
                onChange={(e) => setFilters((c) => ({ ...c, searchQuery: e.target.value }))}
                placeholder="Search ticker, company, broker, order type"
                className="w-full rounded-2xl border border-white/10 bg-background/45 px-4 py-3 text-sm outline-none"
              />
            </label>
            <label className="space-y-2 text-sm">
              <span className="font-medium">Time range</span>
              <select
                value={filters.timeRange}
                onChange={(e) => setFilters((c) => ({ ...c, timeRange: e.target.value as ActivityTimeRange }))}
                className="w-full rounded-2xl border border-white/10 bg-background/45 px-4 py-3 text-sm outline-none"
              >
                {Object.entries(timeRangeLabels).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </label>
            <label className="space-y-2 text-sm">
              <span className="font-medium">Sort by</span>
              <select
                value={filters.sortBy}
                onChange={(e) => setFilters((c) => ({ ...c, sortBy: e.target.value as ActivitySortBy }))}
                className="w-full rounded-2xl border border-white/10 bg-background/45 px-4 py-3 text-sm outline-none"
              >
                <option value="timestamp">Date</option>
                <option value="grossAmountGbp">Gross amount</option>
                <option value="shares">Shares</option>
                <option value="ticker">Ticker</option>
              </select>
            </label>
            <div className="space-y-2 text-sm">
              <span className="font-medium">Sort order</span>
              <Button
                variant="outline"
                onClick={() => setFilters((c) => ({ ...c, sortOrder: c.sortOrder === "asc" ? "desc" : "asc" }))}
                className="w-full justify-between rounded-2xl border-white/10 bg-white/[0.03] px-4 py-3"
              >
                <span>{filters.sortOrder === "asc" ? "Ascending" : "Descending"}</span>
                <ArrowDownUp className="size-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            {activeHistoryFilters ? (
              <>
                {filters.searchQuery.trim() ? <Badge variant="outline">Search: {filters.searchQuery.trim()}</Badge> : null}
                {filters.timeRange !== "all" ? <Badge variant="outline">Range: {timeRangeLabels[filters.timeRange]}</Badge> : null}
                {filters.activityType !== "all" ? <Badge variant="outline">Side: {activityTypeLabels[filters.activityType]}</Badge> : null}
                {filters.quickFilter !== "none" ? <Badge variant="outline">Quick: {quickFilterLabels[filters.quickFilter]}</Badge> : null}
                {filters.brokers.map((broker) => (
                  <Badge key={broker} variant="outline">Broker: {availableBrokers.find((entry) => entry.broker === broker)?.label ?? broker}</Badge>
                ))}
              </>
            ) : (
              <p className="text-xs text-muted-foreground">All trade history is visible. Use filters to focus the table and charts.</p>
            )}
          </div>

          {/* Type filter */}
          <div className="flex flex-wrap gap-2">
            {(["all", "buy", "sell"] as const).map((type) => (
              <Button key={type} size="sm" variant={filters.activityType === type ? "default" : "outline"}
                onClick={() => setFilters((c) => ({ ...c, activityType: type }))}>
                {activityTypeLabels[type]}
              </Button>
            ))}
          </div>
          {/* Broker filter */}
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant={filters.brokers.length === 0 ? "default" : "outline"}
              onClick={() => setFilters((c) => ({ ...c, brokers: [] }))}>All brokers</Button>
            {availableBrokers.map((entry) => (
              <Button key={entry.broker} size="sm"
                variant={filters.brokers.includes(entry.broker) ? "default" : "outline"}
                onClick={() => setFilters((c) => ({
                  ...c,
                  brokers: c.brokers.includes(entry.broker)
                    ? c.brokers.filter((b) => b !== entry.broker)
                    : [...c.brokers, entry.broker],
                }))}>
                {entry.label}
              </Button>
            ))}
          </div>
          {/* Quick filter chips */}
          <div className="flex flex-wrap gap-2">
            <span className="self-center text-xs font-medium text-muted-foreground mr-1">Quick:</span>
            {(Object.entries(quickFilterLabels) as [QuickFilter, string][]).map(([key, label]) => (
              <Button key={key} size="sm" variant={filters.quickFilter === key ? "default" : "outline"}
                onClick={() => setFilters((c) => ({ ...c, quickFilter: key }))}>
                {label}
              </Button>
            ))}
          </div>
          {/* View mode toggle */}
          <div className="flex gap-2 border-t border-white/8 pt-4">
            <Button size="sm" variant={viewMode === "trades" ? "default" : "outline"} className="gap-2"
              onClick={() => setViewMode("trades")}>
              <List className="size-3.5" /> All trades
            </Button>
            <Button size="sm" variant={viewMode === "by-ticker" ? "default" : "outline"} className="gap-2"
              onClick={() => setViewMode("by-ticker")}>
              <BarChart3 className="size-3.5" /> By ticker summary
            </Button>
          </div>
        </CardContent>
      </Card>

      {!hasAnyActivity ? (
        <Card className="border-dashed border-white/12 bg-white/[0.02]">
          <CardHeader>
            <CardTitle>No trade history loaded yet</CardTitle>
            <CardDescription>
              Sync your broker via the API on the integrations page, then use Refresh to pull the latest trade history.
              Trading 212 may rate-limit history requests — if it fails, wait a minute and try again.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-3 text-sm text-muted-foreground">
            <Link href="/integrations" className="font-medium text-primary transition-colors hover:text-primary/80">Open broker connections</Link>
            <Button variant="outline" size="sm" onClick={() => void fetchPortfolio({ refresh: true })} disabled={isRefreshing}>
              <RefreshCw className={isRefreshing ? "size-3.5 animate-spin mr-1" : "size-3.5 mr-1"} />
              Sync now
            </Button>
          </CardContent>
        </Card>
      ) : !hasFilteredResults ? (
        <Card className="border-dashed border-white/12 bg-white/[0.02]">
          <CardHeader>
            <CardTitle>No matching trades</CardTitle>
            <CardDescription>Try widening the time range, clearing filters, or searching for a different ticker.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" onClick={() => setFilters(defaultHistoryFilters)}>Reset filters</Button>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Top Gainers & Losers */}
          <section className="grid gap-4 xl:grid-cols-3">
            <Card className="border-white/10">
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><TrendingUp className="size-5 text-emerald-400" /> Top gainers</CardTitle>
                <CardDescription>Tickers with highest net P&L from closed trades.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {topGainers.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No profitable closed trades yet.</p>
                ) : topGainers.map((s) => (
                  <div key={`${s.ticker}:${s.broker}`} className="flex items-center justify-between rounded-xl border border-white/8 bg-white/[0.03] px-3 py-2">
                    <div>
                      <p className="text-sm font-semibold">{s.ticker}</p>
                      <p className="text-xs text-muted-foreground">{s.companyName} • {s.brokerLabel}</p>
                    </div>
                    <span className="text-sm font-semibold text-emerald-400">{formatSignedMoney(s.netPlGbp)}</span>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card className="border-white/10">
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><TrendingDown className="size-5 text-red-400" /> Top losers</CardTitle>
                <CardDescription>Tickers with worst net P&L from closed trades.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {topLosers.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No loss-making closed trades.</p>
                ) : topLosers.map((s) => (
                  <div key={`${s.ticker}:${s.broker}`} className="flex items-center justify-between rounded-xl border border-white/8 bg-white/[0.03] px-3 py-2">
                    <div>
                      <p className="text-sm font-semibold">{s.ticker}</p>
                      <p className="text-xs text-muted-foreground">{s.companyName} • {s.brokerLabel}</p>
                    </div>
                    <span className="text-sm font-semibold text-red-400">{formatSignedMoney(s.netPlGbp)}</span>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card className="border-white/10">
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><BarChart3 className="size-5 text-sky-400" /> Most traded</CardTitle>
                <CardDescription>Stocks with the highest number of trades.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {mostTraded.map((s) => (
                  <div key={`${s.ticker}:${s.broker}`} className="flex items-center justify-between rounded-xl border border-white/8 bg-white/[0.03] px-3 py-2">
                    <div>
                      <p className="text-sm font-semibold">{s.ticker}</p>
                      <p className="text-xs text-muted-foreground">{s.companyName}</p>
                    </div>
                    <Badge variant="outline">{s.tradeCount} trades</Badge>
                  </div>
                ))}
              </CardContent>
            </Card>
          </section>

          {/* Analytics Insights */}
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.2em] text-muted-foreground">Avg trade size</p>
              <p className="mt-2 text-xl font-semibold">{formatMoney(avgTradeSizeGbp, "GBP")}</p>
              <p className="mt-1 text-xs text-muted-foreground">Mean leg value in filtered range</p>
            </div>
            <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.2em] text-muted-foreground">Best closed trade</p>
              {bestClosedTrade?.sell ? (
                <>
                  <p className="mt-2 text-xl font-semibold text-emerald-400">{formatSignedMoney(bestClosedTrade.plGbp ?? 0)}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {bestClosedTrade.ticker} • {formatShortDate(bestClosedTrade.sell.timestamp)}
                  </p>
                </>
              ) : <p className="mt-2 text-sm text-muted-foreground">—</p>}
            </div>
            <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.2em] text-muted-foreground">Worst closed trade</p>
              {worstClosedTrade?.sell ? (
                <>
                  <p className="mt-2 text-xl font-semibold text-red-400">{formatSignedMoney(worstClosedTrade.plGbp ?? 0)}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {worstClosedTrade.ticker} • {formatShortDate(worstClosedTrade.sell.timestamp)}
                  </p>
                </>
              ) : <p className="mt-2 text-sm text-muted-foreground">—</p>}
            </div>
            <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.2em] text-muted-foreground">Trading days</p>
              <p className="mt-2 text-xl font-semibold">{cumulativePlSeries.length}</p>
              <p className="mt-1 text-xs text-muted-foreground">Days with at least one closed trade</p>
            </div>
          </section>

          {/* Charts */}
          <section className="grid gap-4 xl:grid-cols-[1.6fr_1fr]">
            <Card className="border-white/10">
              <CardHeader>
                <CardTitle>Cumulative realised P/L</CardTitle>
                <CardDescription>Profit and loss from closed trades over time (FIFO / broker-reported).</CardDescription>
              </CardHeader>
              <CardContent className="h-[300px]">
                {cumulativePlSeries.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={cumulativePlSeries}>
                      <defs>
                        <linearGradient id="historyPlArea" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#34d399" stopOpacity={0.52} />
                          <stop offset="95%" stopColor="#34d399" stopOpacity={0.03} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" vertical={false} />
                      <XAxis dataKey="timestamp" tickLine={false} axisLine={false} tickMargin={10} tickFormatter={(v) => formatShortDate(String(v))} />
                      <YAxis tickLine={false} axisLine={false} width={72} tickFormatter={(v) => `£${Number(v ?? 0).toFixed(0)}`} />
                      <Tooltip formatter={(v) => formatSignedMoney(Number(v ?? 0))} labelFormatter={(v) => formatLongDateTime(String(v))} />
                      <Area type="monotone" dataKey="cumulativeRealisedPlGbp" stroke="#34d399" fill="url(#historyPlArea)" strokeWidth={2.5} />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="flex h-full items-center justify-center text-sm text-muted-foreground">No closed trades in this range yet.</p>
                )}
              </CardContent>
            </Card>

            <Card className="border-white/10">
              <CardHeader>
                <CardTitle>Broker breakdown</CardTitle>
                <CardDescription>Open value and realised P/L per broker.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="h-[200px]">
                  {brokerBreakdown.some((entry) => entry.openValueGbp > 0) ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={brokerBreakdown} dataKey="openValueGbp" nameKey="brokerLabel" innerRadius={50} outerRadius={80} paddingAngle={3}>
                          {brokerBreakdown.map((entry, index) => (
                            <Cell key={entry.broker} fill={brokerColours[index % brokerColours.length]} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(v) => formatMoney(Number(v ?? 0), "GBP")} />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : (
                    <p className="flex h-full items-center justify-center text-sm text-muted-foreground">No open positions.</p>
                  )}
                </div>
                <div className="space-y-2">
                  {brokerBreakdown.map((entry, index) => (
                    <div key={entry.broker} className="flex items-center justify-between gap-3 rounded-xl border border-white/8 bg-white/[0.03] px-3 py-2">
                      <div className="flex items-center gap-2">
                        <span className="size-2 rounded-full" style={{ backgroundColor: brokerColours[index % brokerColours.length] }} />
                        <span className="text-sm font-medium">{entry.brokerLabel}</span>
                      </div>
                      <div className="text-right text-xs">
                        <p className="tabular-nums text-muted-foreground">{formatMoney(entry.openValueGbp, "GBP")} open</p>
                        <p className={`tabular-nums font-medium ${entry.realisedPlGbp >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                          {formatSignedMoney(entry.realisedPlGbp)} realised
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </section>

          {/* Monthly realised P/L */}
          {monthlyPl.length > 1 && (
            <Card className="border-white/10">
              <CardHeader>
                <CardTitle>Monthly realised P/L</CardTitle>
                <CardDescription>Closed-trade profit and loss by month in the selected range.</CardDescription>
              </CardHeader>
              <CardContent className="h-[280px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={monthlyPl}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" vertical={false} />
                    <XAxis dataKey="month" tickLine={false} axisLine={false} tickMargin={10} tickFormatter={formatMonth} />
                    <YAxis tickLine={false} axisLine={false} width={72} tickFormatter={(v) => `£${Number(v ?? 0).toFixed(0)}`} />
                    <Tooltip formatter={(v) => formatSignedMoney(Number(v ?? 0))} labelFormatter={(v) => formatMonth(String(v))} />
                    <Bar dataKey="realisedPlGbp" fill="#34d399" radius={[6, 6, 0, 0]} name="Realised P/L" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {/* Trade table or By-ticker summary */}
          {viewMode === "trades" ? (
            <HistoryTradeCyclesTable activity={displayActivity} />
          ) : (
            <Card className="border-white/10">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Per-ticker summary ({tickerSummaries.length})</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="max-h-[65vh] overflow-auto">
                  <Table>
                    <TableHeader className="sticky top-0 z-10 bg-card">
                      <TableRow>
                        <TableHead className="min-w-[100px]">Ticker</TableHead>
                        <TableHead className="min-w-[70px]">Broker</TableHead>
                        <TableHead className="min-w-[55px] text-right">Trades</TableHead>
                        <TableHead className="min-w-[50px] text-right">Buys</TableHead>
                        <TableHead className="min-w-[50px] text-right">Sells</TableHead>
                        <TableHead className="min-w-[90px] text-right">Bought</TableHead>
                        <TableHead className="min-w-[90px] text-right">Sold</TableHead>
                        <TableHead className="min-w-[80px] text-right">Net P&L</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {[...tickerSummaries].sort((a, b) => b.totalBoughtGbp - a.totalBoughtGbp).map((s) => (
                        <TableRow key={`${s.ticker}:${s.broker}`}>
                          <TableCell>
                            <div>
                              <span className="font-medium text-xs">{s.ticker}</span>
                              <span className="ml-1 text-[0.6rem] text-muted-foreground">{s.companyName}</span>
                            </div>
                          </TableCell>
                          <TableCell><span className="text-xs text-muted-foreground">{s.brokerLabel}</span></TableCell>
                          <TableCell className="text-right tabular-nums text-xs">{s.tradeCount}</TableCell>
                          <TableCell className="text-right tabular-nums text-xs">{s.buyCount}</TableCell>
                          <TableCell className="text-right tabular-nums text-xs">{s.sellCount}</TableCell>
                          <TableCell className="text-right tabular-nums text-xs">{formatMoney(s.totalBoughtGbp, "GBP")}</TableCell>
                          <TableCell className="text-right tabular-nums text-xs">{formatMoney(s.totalSoldGbp, "GBP")}</TableCell>
                          <TableCell className={`text-right tabular-nums text-xs font-semibold ${s.netPlGbp >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                            {formatSignedMoney(s.netPlGbp)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </PageShell>
  )
}

