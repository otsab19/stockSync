"use client"

import Link from "next/link"
import { useCallback, useEffect, useMemo, useState } from "react"
import { Fragment } from "react"
import { ArrowDownUp, ChevronDown, ChevronRight, RefreshCw, TrendingUp, TrendingDown, BarChart3, List } from "lucide-react"
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { PageShell } from "@/components/app/page-shell"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { formatMoney } from "@/lib/dashboard/filter-engine"
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

type TickerSummary = {
  ticker: string
  companyName: string
  broker: BrokerId
  brokerLabel: string
  tradeCount: number
  buyCount: number
  sellCount: number
  totalBoughtGbp: number
  totalSoldGbp: number
  totalShares: number
  soldShares: number
  avgBuyPrice: number
  avgSellPrice: number
  netPLGbp: number
  nativeCurrency: "GBP" | "USD"
}


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

function filterHistoryActivity(activity: PortfolioActivityEvent[], filters: HistoryFilterState) {
  const search = filters.searchQuery.trim().toLowerCase()
  const rangeStart = getTimeRangeStart(filters.timeRange)

  const filtered = activity.filter((event) => {
    const eventTimestamp = new Date(event.timestamp)
    const matchesRange = !rangeStart || eventTimestamp >= rangeStart
    const matchesType = filters.activityType === "all" || event.type === filters.activityType
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

function buildTickerSummaries(activity: PortfolioActivityEvent[]): TickerSummary[] {
  const map = new Map<string, TickerSummary>()

  activity.forEach((event) => {
    const key = `${event.ticker}:${event.broker}`
    const existing = map.get(key) ?? {
      ticker: event.ticker,
      companyName: event.companyName,
      broker: event.broker,
      brokerLabel: event.brokerLabel,
      tradeCount: 0,
      buyCount: 0,
      sellCount: 0,
      totalBoughtGbp: 0,
      totalSoldGbp: 0,
      totalShares: 0,
      soldShares: 0,
      avgBuyPrice: 0,
      avgSellPrice: 0,
      netPLGbp: 0,
      nativeCurrency: event.nativeCurrency,
    }

    existing.tradeCount += 1
    if (event.type === "buy") {
      existing.buyCount += 1
      existing.totalBoughtGbp += event.grossAmountGbp
      existing.totalShares += event.shares
    } else {
      existing.sellCount += 1
      existing.totalSoldGbp += event.grossAmountGbp
      existing.soldShares += event.shares
    }
    existing.avgBuyPrice = existing.totalShares > 0 ? existing.totalBoughtGbp / existing.totalShares : 0
    existing.avgSellPrice = existing.soldShares > 0 ? existing.totalSoldGbp / existing.soldShares : 0
    existing.netPLGbp = existing.soldShares > 0 ? existing.totalSoldGbp - (existing.avgBuyPrice * existing.soldShares) : 0
    map.set(key, existing)
  })

  return Array.from(map.values())
}

function buildDailyFlow(activity: PortfolioActivityEvent[]) {
  const byDay = new Map<string, { timestamp: string; buyValueGbp: number; sellValueGbp: number; tradeCount: number }>()

  activity
    .slice()
    .sort((left, right) => new Date(left.timestamp).getTime() - new Date(right.timestamp).getTime())
    .forEach((event) => {
      const day = new Date(event.timestamp)
      day.setHours(0, 0, 0, 0)
      const key = day.toISOString()
      const current = byDay.get(key) ?? { timestamp: key, buyValueGbp: 0, sellValueGbp: 0, tradeCount: 0 }
      if (event.type === "buy") current.buyValueGbp += event.grossAmountGbp
      else current.sellValueGbp += event.grossAmountGbp
      current.tradeCount += 1
      byDay.set(key, current)
    })

  let cumulativeNetFlowGbp = 0
  return Array.from(byDay.values()).map((entry) => {
    const netFlowGbp = entry.sellValueGbp - entry.buyValueGbp
    cumulativeNetFlowGbp += netFlowGbp
    return { ...entry, netFlowGbp, cumulativeNetFlowGbp }
  })
}

function buildBrokerFlow(activity: PortfolioActivityEvent[]) {
  const brokerMap = new Map<string, { broker: BrokerId; brokerLabel: string; valueGbp: number }>()
  activity.forEach((event) => {
    const existing = brokerMap.get(event.broker)
    if (existing) { existing.valueGbp += event.grossAmountGbp; return }
    brokerMap.set(event.broker, { broker: event.broker, brokerLabel: event.brokerLabel, valueGbp: event.grossAmountGbp })
  })
  return Array.from(brokerMap.values()).sort((l, r) => r.valueGbp - l.valueGbp)
}

function buildMonthlyFlow(activity: PortfolioActivityEvent[]) {
  const byMonth = new Map<string, { month: string; buyValueGbp: number; sellValueGbp: number; tradeCount: number }>()
  activity.forEach((event) => {
    const d = new Date(event.timestamp)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
    const current = byMonth.get(key) ?? { month: key, buyValueGbp: 0, sellValueGbp: 0, tradeCount: 0 }
    if (event.type === "buy") current.buyValueGbp += event.grossAmountGbp
    else current.sellValueGbp += event.grossAmountGbp
    current.tradeCount += 1
    byMonth.set(key, current)
  })
  return Array.from(byMonth.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, v]) => v)
}

function formatShortDate(value: string) {
  return new Date(value).toLocaleDateString("en-GB", { month: "short", day: "numeric" })
}

function formatLongDateTime(value: string) {
  return new Date(value).toLocaleString("en-GB", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
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

type TableSortCol = "timestamp" | "ticker" | "shares" | "price" | "gross"
type TableGroupBy = "none" | "ticker" | "broker" | "type"

function HistoryTransactionsTable({ activity }: { activity: PortfolioActivityEvent[] }) {
  const [sortCol, setSortCol] = useState<TableSortCol>("timestamp")
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc")
  const [groupBy, setGroupBy] = useState<TableGroupBy>("broker")
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())

  function handleSort(col: TableSortCol) {
    if (sortCol === col) setSortDir(d => d === "asc" ? "desc" : "asc")
    else { setSortCol(col); setSortDir("desc") }
  }

  const sorted = useMemo(() => {
    const dir = sortDir === "asc" ? 1 : -1
    return [...activity].sort((a, b) => {
      switch (sortCol) {
        case "ticker": return a.ticker.localeCompare(b.ticker) * dir
        case "shares": return (a.shares - b.shares) * dir
        case "price": return (a.price - b.price) * dir
        case "gross": return (a.grossAmountGbp - b.grossAmountGbp) * dir
        default: return (new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()) * dir
      }
    })
  }, [activity, sortCol, sortDir])

  const groups = useMemo(() => {
    if (groupBy === "none") return new Map([["All", sorted]])
    const map = new Map<string, PortfolioActivityEvent[]>()
    for (const e of sorted) {
      const key = groupBy === "ticker" ? e.ticker
        : groupBy === "broker" ? e.brokerLabel
        : e.type === "buy" ? "Buys" : "Sells"
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(e)
    }
    return map
  }, [sorted, groupBy])

  function toggleGroup(key: string) {
    setCollapsedGroups(prev => {
      const next = new Set(prev)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
      }
      return next
    })
  }

  function renderSortHeader(col: TableSortCol, label: string, align?: string) {
    return (
      <TableHead className={`min-w-[70px] cursor-pointer select-none ${align ?? ""}`} onClick={() => handleSort(col)}>
        {label} {sortCol === col ? (sortDir === "asc" ? "↑" : "↓") : ""}
      </TableHead>
    )
  }

  return (
    <Card className="border-white/10">
      <CardHeader className="flex flex-row items-center justify-between gap-3 pb-3">
        <CardTitle className="text-base">Transactions ({activity.length})</CardTitle>
        <select
          value={groupBy}
          onChange={(e) => { setGroupBy(e.target.value as TableGroupBy); setCollapsedGroups(new Set()) }}
          className="rounded-lg border border-white/10 bg-white/[0.03] px-2 py-1 text-xs outline-none"
        >
          <option value="none">No grouping</option>
          <option value="ticker">Group by stock</option>
          <option value="broker">Group by broker</option>
          <option value="type">Group by buy/sell</option>
        </select>
      </CardHeader>
      <CardContent className="p-0">
        <div className="max-h-[65vh] overflow-auto">
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-card">
              <TableRow>
                {renderSortHeader("timestamp", "Date")}
                <TableHead className="min-w-[60px]">Broker</TableHead>
                {renderSortHeader("ticker", "Ticker")}
                <TableHead className="min-w-[50px]">Type</TableHead>
                {renderSortHeader("shares", "Shares", "text-right")}
                {renderSortHeader("price", "Price", "text-right")}
                {renderSortHeader("gross", "Gross", "text-right")}
              </TableRow>
            </TableHeader>
            <TableBody>
              {Array.from(groups.entries()).map(([groupKey, events]) => (
                <Fragment key={groupKey}>
                  {groupBy !== "none" && (
                    <TableRow className="cursor-pointer bg-white/[0.02] hover:bg-white/[0.04]" onClick={() => toggleGroup(groupKey)}>
                      <TableCell colSpan={7} className="py-2">
                        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                          {collapsedGroups.has(groupKey) ? <ChevronRight className="size-3.5" /> : <ChevronDown className="size-3.5" />}
                          {groupKey} ({events.length})
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                  {!collapsedGroups.has(groupKey) && events.map((event) => (
                    <TableRow key={event.id}>
                      <TableCell><span className="text-xs">{formatLongDateTime(event.timestamp)}</span></TableCell>
                      <TableCell><span className="text-xs text-muted-foreground">{event.brokerLabel}</span></TableCell>
                      <TableCell>
                        <span className="font-medium text-xs">{event.ticker}</span>
                        {shouldShowCompanyName(event) ? (
                          <span className="ml-1 text-[0.6rem] text-muted-foreground">{event.companyName}</span>
                        ) : null}
                      </TableCell>
                      <TableCell>
                        <span className={`text-xs font-medium ${event.type === "buy" ? "text-emerald-400" : "text-red-400"}`}>{event.type === "buy" ? "Buy" : "Sell"}</span>
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-xs">{formatTradeShares(event.shares)}</TableCell>
                      <TableCell className="text-right tabular-nums text-xs">{formatTradePrice(event.price, event.nativeCurrency)}</TableCell>
                      <TableCell className="text-right tabular-nums text-xs font-medium">{formatMoney(event.grossAmountGbp, "GBP")}</TableCell>
                    </TableRow>
                  ))}
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
  const rawActivity = useMemo(
    () => portfolioResponse?.status === "ok"
      ? (portfolioResponse.activity ?? portfolioResponse.insights.activity ?? [])
      : [],
    [portfolioResponse]
  )
  const availableBrokers = useMemo(
    () => Array.from(new Map<BrokerId, { broker: BrokerId; label: string }>([
      ...portfolio.map((p) => [p.broker, { broker: p.broker, label: p.brokerLabel }] as const),
      ...rawActivity.map((e) => [e.broker, { broker: e.broker, label: e.brokerLabel }] as const),
    ]).values()),
    [portfolio, rawActivity]
  )

  const filteredActivity = useMemo(() => filterHistoryActivity(rawActivity, filters), [filters, rawActivity])
  const tickerSummaries = useMemo(() => buildTickerSummaries(filteredActivity), [filteredActivity])

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
      const profitableTickers = new Set(tickerSummaries.filter((s) => s.netPLGbp > 0).map((s) => `${s.ticker}:${s.broker}`))
      return filteredActivity.filter((e) => profitableTickers.has(`${e.ticker}:${e.broker}`))
    }
    if (filters.quickFilter === "loss-making") {
      const lossTickers = new Set(tickerSummaries.filter((s) => s.netPLGbp < 0).map((s) => `${s.ticker}:${s.broker}`))
      return filteredActivity.filter((e) => lossTickers.has(`${e.ticker}:${e.broker}`))
    }
    return filteredActivity
  }, [filteredActivity, filters.quickFilter, tickerSummaries])

  const historySeries = useMemo(() => buildDailyFlow(displayActivity), [displayActivity])
  const brokerFlow = useMemo(() => buildBrokerFlow(displayActivity), [displayActivity])
  const monthlyFlow = useMemo(() => buildMonthlyFlow(displayActivity), [displayActivity])

  // Analytics computations
  const topGainers = useMemo(() => tickerSummaries.filter((s) => s.sellCount > 0).sort((a, b) => b.netPLGbp - a.netPLGbp).slice(0, 5), [tickerSummaries])
  const topLosers = useMemo(() => tickerSummaries.filter((s) => s.sellCount > 0 && s.netPLGbp < 0).sort((a, b) => a.netPLGbp - b.netPLGbp).slice(0, 5), [tickerSummaries])
  const mostTraded = useMemo(() => [...tickerSummaries].sort((a, b) => b.tradeCount - a.tradeCount).slice(0, 5), [tickerSummaries])

  const sells = displayActivity.filter((e) => e.type === "sell")
  const winRate = sells.length > 0
    ? (sells.filter((e) => {
        const summary = tickerSummaries.find((s) => s.ticker === e.ticker && s.broker === e.broker)
        return summary && summary.netPLGbp > 0
      }).length / sells.length * 100)
    : 0

  const bestTrade = displayActivity.length > 0 ? displayActivity.reduce((best, e) => e.grossAmountGbp > best.grossAmountGbp ? e : best) : null
  const worstTrade = displayActivity.length > 0 ? displayActivity.reduce((worst, e) => e.grossAmountGbp < worst.grossAmountGbp ? e : worst) : null

  const totalBuyValueGbp = displayActivity.filter((e) => e.type === "buy").reduce((sum, e) => sum + e.grossAmountGbp, 0)
  const totalSellValueGbp = displayActivity.filter((e) => e.type === "sell").reduce((sum, e) => sum + e.grossAmountGbp, 0)

  // Realized P&L: prefer explicit realisedProfitGbp from broker (T212 provides this on sells)
  // Fall back to per-ticker net for tickers with both buys and sells
  const realisedPL = (() => {
    // First try: sum explicit realisedProfitGbp from sell events
    const explicitPL = displayActivity
      .filter((e) => e.realisedProfitGbp !== undefined)
      .reduce((sum, e) => sum + (e.realisedProfitGbp ?? 0), 0)

    if (explicitPL !== 0) return explicitPL

    // Fallback: per-ticker net P&L for tickers with both buys AND sells (completed round-trips)
    return tickerSummaries
      .filter((s) => s.buyCount > 0 && s.sellCount > 0)
      .reduce((sum, s) => sum + s.netPLGbp, 0)
  })()

  const avgTradeSizeGbp = displayActivity.length === 0 ? 0 : displayActivity.reduce((sum, e) => sum + e.grossAmountGbp, 0) / displayActivity.length

  const hasAnyActivity = rawActivity.length > 0
  const hasFilteredResults = displayActivity.length > 0
  const activeHistoryFilters = hasActiveHistoryFilters(filters)

  return (
    <PageShell>
      <div className="flex flex-wrap items-center justify-between gap-3 px-1">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Trade history</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Showing {displayActivity.length} of {rawActivity.length} trade{rawActivity.length === 1 ? "" : "s"}
          </p>
          {isRefreshing && <p className="mt-0.5 text-xs text-muted-foreground">Syncing from brokers (T212 history may take ~30s due to rate limits)...</p>}
        </div>
        <Button variant="outline" size="sm" onClick={() => void fetchPortfolio({ refresh: true })} disabled={isRefreshing} className="gap-2 rounded-xl border-white/10 bg-white/[0.03]">
          <RefreshCw className={isRefreshing ? "size-4 animate-spin" : "size-4"} />
          {isRefreshing ? "Syncing..." : "Refresh"}
        </Button>
      </div>

      {/* KPI Strip */}
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-muted-foreground">Realised P&L</p>
          <p className={`mt-2 text-2xl font-semibold tracking-tight ${realisedPL >= 0 ? "text-emerald-400" : "text-red-400"}`}>{formatSignedMoney(realisedPL)}</p>
          <p className="mt-1 text-xs text-muted-foreground">From completed trades</p>
        </div>
        <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-muted-foreground">Total bought</p>
          <p className="mt-2 text-2xl font-semibold tracking-tight">{formatMoney(totalBuyValueGbp, "GBP")}</p>
          <p className="mt-1 text-xs text-muted-foreground">{displayActivity.filter((e) => e.type === "buy").length} buy orders</p>
        </div>
        <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-muted-foreground">Total sold</p>
          <p className="mt-2 text-2xl font-semibold tracking-tight">{formatMoney(totalSellValueGbp, "GBP")}</p>
          <p className="mt-1 text-xs text-muted-foreground">{displayActivity.filter((e) => e.type === "sell").length} sell orders</p>
        </div>
        <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-muted-foreground">Total trades</p>
          <p className="mt-2 text-2xl font-semibold tracking-tight">{displayActivity.length}</p>
        </div>
        <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-muted-foreground">Win rate</p>
          <p className="mt-2 text-2xl font-semibold tracking-tight">{winRate.toFixed(1)}%</p>
          <p className="mt-1 text-xs text-muted-foreground">of tickers with sells</p>
        </div>
      </section>

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
                    <span className="text-sm font-semibold text-emerald-400">{formatSignedMoney(s.netPLGbp)}</span>
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
                    <span className="text-sm font-semibold text-red-400">{formatSignedMoney(s.netPLGbp)}</span>
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
              <p className="mt-1 text-xs text-muted-foreground">Mean value per trade</p>
            </div>
            <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.2em] text-muted-foreground">Best single trade</p>
              {bestTrade ? (
                <>
                  <p className="mt-2 text-xl font-semibold">{formatMoney(bestTrade.grossAmountGbp, "GBP")}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{bestTrade.ticker} • {bestTrade.type} • {formatShortDate(bestTrade.timestamp)}</p>
                </>
              ) : <p className="mt-2 text-sm text-muted-foreground">—</p>}
            </div>
            <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.2em] text-muted-foreground">Smallest trade</p>
              {worstTrade ? (
                <>
                  <p className="mt-2 text-xl font-semibold">{formatMoney(worstTrade.grossAmountGbp, "GBP")}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{worstTrade.ticker} • {worstTrade.type} • {formatShortDate(worstTrade.timestamp)}</p>
                </>
              ) : <p className="mt-2 text-sm text-muted-foreground">—</p>}
            </div>
            <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.2em] text-muted-foreground">Active days</p>
              <p className="mt-2 text-xl font-semibold">{historySeries.length}</p>
              <p className="mt-1 text-xs text-muted-foreground">Days with at least one trade</p>
            </div>
          </section>

          {/* Charts */}
          <section className="grid gap-4 xl:grid-cols-[1.6fr_1fr]">
            <Card className="border-white/10">
              <CardHeader>
                <CardTitle>Cumulative net flow</CardTitle>
                <CardDescription>How buys and sells compound over time.</CardDescription>
              </CardHeader>
              <CardContent className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={historySeries}>
                    <defs>
                      <linearGradient id="historyArea" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#60a5fa" stopOpacity={0.52} />
                        <stop offset="95%" stopColor="#60a5fa" stopOpacity={0.03} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" vertical={false} />
                    <XAxis dataKey="timestamp" tickLine={false} axisLine={false} tickMargin={10} tickFormatter={(v) => formatShortDate(String(v))} />
                    <YAxis tickLine={false} axisLine={false} width={72} tickFormatter={(v) => `£${Number(v ?? 0).toFixed(0)}`} />
                    <Tooltip formatter={(v) => formatMoney(Number(v ?? 0), "GBP")} labelFormatter={(v) => formatLongDateTime(String(v))} />
                    <Area type="monotone" dataKey="cumulativeNetFlowGbp" stroke="#60a5fa" fill="url(#historyArea)" strokeWidth={2.5} />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card className="border-white/10">
              <CardHeader>
                <CardTitle>Broker mix</CardTitle>
                <CardDescription>Gross traded value by broker.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="h-[200px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={brokerFlow} dataKey="valueGbp" nameKey="brokerLabel" innerRadius={50} outerRadius={80} paddingAngle={3}>
                        {brokerFlow.map((entry, index) => (
                          <Cell key={entry.broker} fill={brokerColours[index % brokerColours.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(v) => formatMoney(Number(v ?? 0), "GBP")} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="space-y-2">
                  {brokerFlow.map((entry, index) => (
                    <div key={entry.broker} className="flex items-center justify-between gap-3 rounded-xl border border-white/8 bg-white/[0.03] px-3 py-2">
                      <div className="flex items-center gap-2">
                        <span className="size-2 rounded-full" style={{ backgroundColor: brokerColours[index % brokerColours.length] }} />
                        <span className="text-sm font-medium">{entry.brokerLabel}</span>
                      </div>
                      <span className="text-xs text-muted-foreground">{formatMoney(entry.valueGbp, "GBP")}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </section>

          {/* Monthly cadence */}
          {monthlyFlow.length > 1 && (
            <Card className="border-white/10">
              <CardHeader>
                <CardTitle>Monthly investment cadence</CardTitle>
                <CardDescription>Buy vs sell volume per month.</CardDescription>
              </CardHeader>
              <CardContent className="h-[280px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={monthlyFlow}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" vertical={false} />
                    <XAxis dataKey="month" tickLine={false} axisLine={false} tickMargin={10} tickFormatter={formatMonth} />
                    <YAxis tickLine={false} axisLine={false} width={72} tickFormatter={(v) => `£${Number(v ?? 0).toFixed(0)}`} />
                    <Tooltip formatter={(v) => formatMoney(Number(v ?? 0), "GBP")} labelFormatter={(v) => formatMonth(String(v))} />
                    <Bar dataKey="buyValueGbp" fill="#34d399" radius={[6, 6, 0, 0]} name="Buy" />
                    <Bar dataKey="sellValueGbp" fill="#38bdf8" radius={[6, 6, 0, 0]} name="Sell" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {/* Trade table or By-ticker summary */}
          {viewMode === "trades" ? (
            <HistoryTransactionsTable activity={displayActivity} />
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
                          <TableCell className={`text-right tabular-nums text-xs font-semibold ${s.netPLGbp >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                            {formatSignedMoney(s.netPLGbp)}
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

