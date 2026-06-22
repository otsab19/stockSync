"use client"

import { Fragment, useCallback, useEffect, useMemo, useState } from "react"
import { ArrowDownLeft, ArrowUpRight, ChevronDown, RefreshCw, Search } from "lucide-react"
import { PageHeader, PageShell } from "@/components/app/page-shell"
import { ActivityPlChart } from "@/components/dashboard/activity-pl-chart"
import { BrokerFreshnessList, FreshnessBadge } from "@/components/dashboard/freshness-badge"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  buildSellPlLookup,
  dedupeActivityEvents,
  endOfDay,
  filterActivityByDateRange,
  formatDateInputValue,
  formatDateRangeLabel,
  getDateRangeForPreset,
  getSellPlGbp,
  parseDateInputValue,
  splitActivityBySide,
  startOfDay,
  summarizeActivityPeriod,
  type ActivityDatePreset,
} from "@/lib/dashboard/activity-view"
import { formatMoney } from "@/lib/dashboard/filter-engine"
import { createClientPortfolioRepository } from "@/lib/portfolio/client-factory"
import { cn } from "@/lib/utils"
import type { PortfolioActivityEvent, PortfolioApiResponse } from "@/types/portfolio"

type ActivityDashboardState = "loading" | "ready" | "setup_required" | "unauthorized" | "client_only" | "error"
type ActivityGroupMode = "broker" | "side"
type ActivitySortBy = "timestamp" | "ticker" | "amount" | "shares"

const presetLabels: Record<ActivityDatePreset, string> = {
  today: "Today",
  yesterday: "Yesterday",
  "last-7d": "Last 7 days",
  "last-30d": "Last 30 days",
  custom: "Custom",
}

const groupModeLabels: Record<ActivityGroupMode, string> = {
  broker: "Broker",
  side: "Buy/Sell",
}

const activitySortLabels: Record<ActivitySortBy, string> = {
  timestamp: "Newest",
  ticker: "Ticker",
  amount: "Amount",
  shares: "Shares",
}

function formatLongDateTime(value: string) {
  return new Date(value).toLocaleString("en-GB", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
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
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits,
  }).format(value)
}

function shouldShowCompanyName(event: PortfolioActivityEvent) {
  return event.companyName.trim().toUpperCase() !== event.ticker.trim().toUpperCase()
}

function filterAndSortActivity(activity: PortfolioActivityEvent[], searchQuery: string, sortBy: ActivitySortBy) {
  const query = searchQuery.trim().toLowerCase()
  const filtered = activity.filter((event) => {
    if (!query) return true
    return event.ticker.toLowerCase().includes(query)
      || event.companyName.toLowerCase().includes(query)
      || event.brokerLabel.toLowerCase().includes(query)
      || event.orderType?.toLowerCase().includes(query)
  })

  return filtered.sort((left, right) => {
    switch (sortBy) {
      case "ticker":
        return left.ticker.localeCompare(right.ticker) || new Date(right.timestamp).getTime() - new Date(left.timestamp).getTime()
      case "amount":
        return right.grossAmountGbp - left.grossAmountGbp
      case "shares":
        return right.shares - left.shares
      case "timestamp":
      default:
        return new Date(right.timestamp).getTime() - new Date(left.timestamp).getTime()
    }
  })
}

function ActivityTable({
  events,
  side,
  sellPlLookup,
}: {
  events: PortfolioActivityEvent[]
  side: "buy" | "sell"
  sellPlLookup: Map<string, number | null>
}) {
  const [expandedEventId, setExpandedEventId] = useState<string | null>(null)

  if (events.length === 0) {
    return (
      <div className="flex min-h-[12rem] items-center justify-center px-4 py-8 text-sm text-muted-foreground">
        No {side === "buy" ? "buys" : "sells"} in this period.
      </div>
    )
  }

  return (
    <div className="max-h-[55vh] overflow-auto">
      <Table>
        <TableHeader className="sticky top-0 z-10 bg-card">
          <TableRow>
            <TableHead className="min-w-[120px]">Time</TableHead>
            <TableHead className="min-w-[90px]">Ticker</TableHead>
            <TableHead className="min-w-[70px]">Broker</TableHead>
            <TableHead className="min-w-[70px] text-right">Shares</TableHead>
            <TableHead className="min-w-[80px] text-right">Price</TableHead>
            <TableHead className="min-w-[90px] text-right">Amount</TableHead>
            {side === "sell" ? <TableHead className="min-w-[90px] text-right">P/L</TableHead> : null}
            <TableHead className="min-w-[80px] text-right">Details</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {events.map((event) => {
            const isExpanded = expandedEventId === event.id
            const plGbp = side === "sell" ? getSellPlGbp(event, sellPlLookup) : null

            return (
              <Fragment key={event.id}>
                <TableRow className="bg-white/[0.01]">
                  <TableCell><span className="text-xs">{formatLongDateTime(event.timestamp)}</span></TableCell>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="text-xs font-medium">{event.ticker}</span>
                      {shouldShowCompanyName(event) ? (
                        <span className="text-[0.6rem] text-muted-foreground">{event.companyName}</span>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell><span className="text-xs text-muted-foreground">{event.brokerLabel}</span></TableCell>
                  <TableCell className="text-right tabular-nums text-xs">{formatTradeShares(event.shares)}</TableCell>
                  <TableCell className="text-right tabular-nums text-xs">{formatTradePrice(event.price, event.nativeCurrency)}</TableCell>
                  <TableCell className="text-right tabular-nums text-xs">{formatMoney(event.grossAmountGbp, "GBP")}</TableCell>
                  {side === "sell" ? (
                    <TableCell className="text-right">
                      {plGbp === null ? (
                        <span className="text-xs text-muted-foreground">—</span>
                      ) : (
                        <span className={`text-xs font-semibold tabular-nums ${plGbp >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                          {formatSignedMoney(plGbp)}
                        </span>
                      )}
                    </TableCell>
                  ) : null}
                  <TableCell className="text-right">
                    <button
                      type="button"
                      onClick={() => setExpandedEventId(isExpanded ? null : event.id)}
                      className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-muted-foreground hover:bg-white/[0.04] hover:text-foreground"
                    >
                      Details
                      <ChevronDown className={cn("size-3 transition-transform", isExpanded && "rotate-180")} />
                    </button>
                  </TableCell>
                </TableRow>
                {isExpanded ? (
                  <TableRow className="bg-white/[0.018] hover:bg-white/[0.018]">
                    <TableCell colSpan={side === "sell" ? 8 : 7} className="whitespace-normal p-4">
                      <div className="grid gap-3 text-xs text-muted-foreground sm:grid-cols-2 lg:grid-cols-4">
                        <div><span className="block uppercase tracking-[0.16em]">Order type</span><span className="mt-1 block text-foreground">{event.orderType || "Not provided"}</span></div>
                        <div><span className="block uppercase tracking-[0.16em]">Native amount</span><span className="mt-1 block text-foreground">{formatTradePrice(event.grossAmount, event.nativeCurrency)}</span></div>
                        <div><span className="block uppercase tracking-[0.16em]">GBP amount</span><span className="mt-1 block text-foreground">{formatMoney(event.grossAmountGbp, "GBP")}</span></div>
                        <div><span className="block uppercase tracking-[0.16em]">P/L source</span><span className="mt-1 block text-foreground">{event.realisedProfitGbp !== undefined ? "Broker reported" : side === "sell" ? "FIFO estimate" : "Not applicable"}</span></div>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : null}
              </Fragment>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}

function ActivitySideCards({
  buys,
  sells,
  summary,
  sellPlLookup,
}: {
  buys: PortfolioActivityEvent[]
  sells: PortfolioActivityEvent[]
  summary: ReturnType<typeof summarizeActivityPeriod>
  sellPlLookup: Map<string, number | null>
}) {
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Card className="border-white/10">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="flex size-8 items-center justify-center rounded-xl border border-emerald-500/20 bg-emerald-500/10 text-emerald-400">
                <ArrowDownLeft className="size-4" />
              </span>
              <div>
                <CardTitle className="text-base">Bought</CardTitle>
                <CardDescription>{summary.buyCount} trade{summary.buyCount === 1 ? "" : "s"} · {formatMoney(summary.totalBoughtGbp, "GBP")}</CardDescription>
              </div>
            </div>
            <Badge variant="outline" className="border-emerald-500/20 text-emerald-400">Buy</Badge>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <ActivityTable events={buys} side="buy" sellPlLookup={sellPlLookup} />
        </CardContent>
      </Card>

      <Card className="border-white/10">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="flex size-8 items-center justify-center rounded-xl border border-red-500/20 bg-red-500/10 text-red-400">
                <ArrowUpRight className="size-4" />
              </span>
              <div>
                <CardTitle className="text-base">Sold</CardTitle>
                <CardDescription>{summary.sellCount} trade{summary.sellCount === 1 ? "" : "s"} · {formatMoney(summary.totalSoldGbp, "GBP")}</CardDescription>
              </div>
            </div>
            <Badge variant="outline" className="border-red-500/20 text-red-400">Sell</Badge>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <ActivityTable events={sells} side="sell" sellPlLookup={sellPlLookup} />
        </CardContent>
      </Card>
    </div>
  )
}

export default function DashboardActivityPage() {
  const [portfolioResponse, setPortfolioResponse] = useState<PortfolioApiResponse | null>(null)
  const [, setDashboardState] = useState<ActivityDashboardState>("loading")
  const [message, setMessage] = useState<string | null>(null)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [preset, setPreset] = useState<ActivityDatePreset>("today")
  const [groupMode, setGroupMode] = useState<ActivityGroupMode>("broker")
  const [searchQuery, setSearchQuery] = useState("")
  const [sortBy, setSortBy] = useState<ActivitySortBy>("timestamp")
  const [customStart, setCustomStart] = useState(() => formatDateInputValue(new Date()))
  const [customEnd, setCustomEnd] = useState(() => formatDateInputValue(new Date()))

  const fetchPortfolio = useCallback(async ({ refresh = false }: { refresh?: boolean } = {}) => {
    try {
      if (refresh) setIsRefreshing(true)
      const repository = createClientPortfolioRepository()
      const data = await repository.getPortfolio({ refresh, includeActivity: true, preferCache: !refresh })
      setPortfolioResponse(data)
      if (data.status === "ok") {
        setDashboardState("ready")
        setMessage(data.message ?? null)
        return
      }
      setDashboardState(data.status)
      setMessage(data.message)
    } catch (error) {
      console.error("Failed to fetch trading activity:", error)
      setPortfolioResponse(null)
      setDashboardState("error")
      setMessage("Unable to load trading activity from the selected backend.")
    } finally {
      if (refresh) setIsRefreshing(false)
    }
  }, [])

  useEffect(() => {
    const timeoutId = window.setTimeout(() => { void fetchPortfolio() }, 0)
    return () => { window.clearTimeout(timeoutId) }
  }, [fetchPortfolio])

  const rawActivity = useMemo(() => {
    const activity = portfolioResponse?.status === "ok"
      ? (portfolioResponse.activity ?? portfolioResponse.insights.activity ?? [])
      : []
    return dedupeActivityEvents(activity)
  }, [portfolioResponse])

  const dateRange = useMemo(() => {
    if (preset === "custom") {
      const start = startOfDay(parseDateInputValue(customStart))
      const end = endOfDay(parseDateInputValue(customEnd))
      return start.getTime() <= end.getTime() ? { start, end } : { start: end, end: start }
    }
    return getDateRangeForPreset(preset)
  }, [customEnd, customStart, preset])

  const sellPlLookup = useMemo(() => buildSellPlLookup(rawActivity), [rawActivity])

  const rangeActivity = useMemo(
    () => filterActivityByDateRange(rawActivity, dateRange.start, dateRange.end),
    [dateRange.end, dateRange.start, rawActivity]
  )
  const periodActivity = useMemo(
    () => filterAndSortActivity(rangeActivity, searchQuery, sortBy),
    [rangeActivity, searchQuery, sortBy]
  )
  const summary = useMemo(
    () => summarizeActivityPeriod(periodActivity, sellPlLookup),
    [periodActivity, sellPlLookup]
  )
  const { buys, sells } = useMemo(() => splitActivityBySide(periodActivity), [periodActivity])
  const brokerGroups = useMemo(() => {
    const groups = new Map<string, { key: string; label: string; activity: PortfolioActivityEvent[] }>()

    periodActivity.forEach((event) => {
      const existing = groups.get(event.broker) ?? {
        key: event.broker,
        label: event.brokerLabel,
        activity: [],
      }
      existing.activity.push(event)
      groups.set(event.broker, existing)
    })

    return Array.from(groups.values())
      .map((group) => {
        const split = splitActivityBySide(group.activity)
        return {
          ...group,
          ...split,
          summary: summarizeActivityPeriod(group.activity, sellPlLookup),
        }
      })
      .sort((left, right) => right.activity.length - left.activity.length || left.label.localeCompare(right.label))
  }, [periodActivity, sellPlLookup])
  const rangeLabel = useMemo(() => formatDateRangeLabel(dateRange.start, dateRange.end), [dateRange.end, dateRange.start])
  const hasBrokerError = Boolean(portfolioResponse?.meta?.lastError || portfolioResponse?.meta?.brokerDetails?.some((broker) => broker.lastError))
  const noActivityReason = rawActivity.length === 0
    ? hasBrokerError
      ? "A broker sync error was reported. Refresh again or check Connections for details."
      : "No synced trade activity is stored yet. Run a manual sync to import broker trades."
    : rangeActivity.length === 0
      ? "There is synced activity, but none in this date range."
      : "Your search or filters are hiding the trades in this range."

  return (
    <PageShell>
      <PageHeader
        eyebrow="Trades"
        title="Trading activity"
        description={`${rangeLabel} · ${periodActivity.length} trade leg${periodActivity.length === 1 ? "" : "s"}${message ? ` · ${message}` : ""}`}
        badges={
          <>
            <FreshnessBadge meta={portfolioResponse?.meta} source={portfolioResponse?.source ?? "server"} />
            <BrokerFreshnessList meta={portfolioResponse?.meta} />
          </>
        }
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => void fetchPortfolio({ refresh: true })}
            disabled={isRefreshing}
            className="gap-2 rounded-xl border-white/10 bg-white/[0.03]"
          >
            <RefreshCw className={isRefreshing ? "size-4 animate-spin" : "size-4"} />
            {isRefreshing ? "Syncing..." : "Sync now"}
          </Button>
        }
      />

      <Card className="border-white/10">
        <CardHeader className="gap-4 pb-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <CardTitle className="text-base">Date range</CardTitle>
              <CardDescription>Defaults to today. Pick a preset or choose custom dates.</CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(presetLabels) as ActivityDatePreset[]).map((value) => (
                <Button
                  key={value}
                  size="sm"
                  variant={preset === value ? "default" : "outline"}
                  className={preset === value ? "" : "rounded-xl border-white/10 bg-white/[0.03]"}
                  onClick={() => setPreset(value)}
                >
                  {presetLabels[value]}
                </Button>
              ))}
            </div>
          </div>
          {preset === "custom" ? (
            <div className="flex flex-wrap items-end gap-3">
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                From
                <input
                  type="date"
                  value={customStart}
                  onChange={(event) => setCustomStart(event.target.value)}
                  className="rounded-lg border border-white/10 bg-white/[0.03] px-2 py-1.5 text-sm text-foreground outline-none"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                To
                <input
                  type="date"
                  value={customEnd}
                  onChange={(event) => setCustomEnd(event.target.value)}
                  className="rounded-lg border border-white/10 bg-white/[0.03] px-2 py-1.5 text-sm text-foreground outline-none"
                />
              </label>
            </div>
          ) : null}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground">Group by</span>
            {(Object.keys(groupModeLabels) as ActivityGroupMode[]).map((value) => (
              <Button
                key={value}
                size="sm"
                variant={groupMode === value ? "default" : "outline"}
                className={groupMode === value ? "" : "rounded-xl border-white/10 bg-white/[0.03]"}
                onClick={() => setGroupMode(value)}
              >
                {groupModeLabels[value]}
              </Button>
            ))}
          </div>
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
            <label className="relative">
              <Search className="pointer-events-none absolute left-3 top-2.5 size-4 text-muted-foreground" />
              <input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search ticker, company, broker, or order type..."
                className="w-full rounded-xl border border-white/10 bg-white/[0.03] py-2 pl-9 pr-3 text-sm outline-none focus:border-primary/50"
              />
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted-foreground">Sort</span>
              {(Object.keys(activitySortLabels) as ActivitySortBy[]).map((value) => (
                <Button
                  key={value}
                  size="sm"
                  variant={sortBy === value ? "default" : "outline"}
                  className={sortBy === value ? "" : "rounded-xl border-white/10 bg-white/[0.03]"}
                  onClick={() => setSortBy(value)}
                >
                  {activitySortLabels[value]}
                </Button>
              ))}
            </div>
          </div>
        </CardHeader>
      </Card>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-muted-foreground">Bought</p>
          <p className="mt-2 text-2xl font-semibold tracking-tight text-emerald-400">{formatMoney(summary.totalBoughtGbp, "GBP")}</p>
          <p className="mt-1 text-xs text-muted-foreground">{summary.buyCount} buy leg{summary.buyCount === 1 ? "" : "s"}</p>
        </div>
        <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-muted-foreground">Sold</p>
          <p className="mt-2 text-2xl font-semibold tracking-tight text-red-400">{formatMoney(summary.totalSoldGbp, "GBP")}</p>
          <p className="mt-1 text-xs text-muted-foreground">{summary.sellCount} sell leg{summary.sellCount === 1 ? "" : "s"}</p>
        </div>
        <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-muted-foreground">Realised P/L</p>
          <p className={`mt-2 text-2xl font-semibold tracking-tight ${summary.totalRealisedPlGbp >= 0 ? "text-emerald-400" : "text-red-400"}`}>
            {formatSignedMoney(summary.totalRealisedPlGbp)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">Broker realised P/L when available; otherwise FIFO estimate.</p>
        </div>
        <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-muted-foreground">Activity</p>
          <p className="mt-2 text-2xl font-semibold tracking-tight">{periodActivity.length}</p>
          <p className="mt-1 text-xs text-muted-foreground">{rawActivity.length} total legs loaded</p>
        </div>
      </section>

      {rawActivity.length > 0 ? (
        <ActivityPlChart
          activity={rawActivity}
          sellPlLookup={sellPlLookup}
          rangeStart={dateRange.start}
          rangeEnd={dateRange.end}
        />
      ) : null}

      {rawActivity.length === 0 ? (
        <Card className="border-dashed border-white/12 bg-white/[0.02]">
          <CardHeader>
            <CardTitle>No trading activity loaded</CardTitle>
            <CardDescription>{noActivityReason}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => void fetchPortfolio({ refresh: true })} disabled={isRefreshing} className="rounded-xl">
              {isRefreshing ? "Syncing..." : "Sync now"}
            </Button>
          </CardContent>
        </Card>
      ) : periodActivity.length === 0 ? (
        <Card className="border-dashed border-white/12 bg-white/[0.02]">
          <CardHeader>
            <CardTitle>No trades in this period</CardTitle>
            <CardDescription>{noActivityReason}</CardDescription>
          </CardHeader>
        </Card>
      ) : groupMode === "broker" ? (
        <div className="space-y-4">
          {brokerGroups.map((group) => (
            <section key={group.key} className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 px-1">
                <div>
                  <h2 className="text-base font-semibold">{group.label}</h2>
                  <p className="text-xs text-muted-foreground">
                    {group.activity.length} trade leg{group.activity.length === 1 ? "" : "s"} · Bought {formatMoney(group.summary.totalBoughtGbp, "GBP")} · Sold {formatMoney(group.summary.totalSoldGbp, "GBP")}
                  </p>
                </div>
                <Badge variant="outline" className={group.summary.totalRealisedPlGbp >= 0 ? "border-emerald-500/20 text-emerald-400" : "border-red-500/20 text-red-400"}>
                  P/L {formatSignedMoney(group.summary.totalRealisedPlGbp)}
                </Badge>
              </div>
              <ActivitySideCards buys={group.buys} sells={group.sells} summary={group.summary} sellPlLookup={sellPlLookup} />
            </section>
          ))}
        </div>
      ) : (
        <ActivitySideCards buys={buys} sells={sells} summary={summary} sellPlLookup={sellPlLookup} />
      )}
    </PageShell>
  )
}
