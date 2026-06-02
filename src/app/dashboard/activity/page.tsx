"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { ArrowDownLeft, ArrowUpRight, RefreshCw } from "lucide-react"
import { PageShell } from "@/components/app/page-shell"
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
import type { PortfolioActivityEvent, PortfolioApiResponse } from "@/types/portfolio"

type ActivityDashboardState = "loading" | "ready" | "setup_required" | "unauthorized" | "client_only" | "error"

const presetLabels: Record<ActivityDatePreset, string> = {
  today: "Today",
  yesterday: "Yesterday",
  "last-7d": "Last 7 days",
  "last-30d": "Last 30 days",
  custom: "Custom",
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

function ActivityTable({
  events,
  side,
  sellPlLookup,
}: {
  events: PortfolioActivityEvent[]
  side: "buy" | "sell"
  sellPlLookup: Map<string, number | null>
}) {
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
          </TableRow>
        </TableHeader>
        <TableBody>
          {events.map((event) => (
            <TableRow key={event.id} className="bg-white/[0.01]">
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
                  {(() => {
                    const plGbp = getSellPlGbp(event, sellPlLookup)
                    if (plGbp === null) {
                      return <span className="text-xs text-muted-foreground">—</span>
                    }
                    return (
                      <span className={`text-xs font-semibold tabular-nums ${plGbp >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                        {formatSignedMoney(plGbp)}
                      </span>
                    )
                  })()}
                </TableCell>
              ) : null}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

export default function DashboardActivityPage() {
  const [portfolioResponse, setPortfolioResponse] = useState<PortfolioApiResponse | null>(null)
  const [, setDashboardState] = useState<ActivityDashboardState>("loading")
  const [, setMessage] = useState<string | null>(null)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [preset, setPreset] = useState<ActivityDatePreset>("today")
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

  const todayKey = formatDateInputValue(new Date())

  const dateRange = useMemo(() => {
    if (preset === "custom") {
      const start = startOfDay(parseDateInputValue(customStart))
      const end = endOfDay(parseDateInputValue(customEnd))
      return start.getTime() <= end.getTime() ? { start, end } : { start: end, end: start }
    }
    return getDateRangeForPreset(preset)
  }, [customEnd, customStart, preset, todayKey])

  const sellPlLookup = useMemo(() => buildSellPlLookup(rawActivity), [rawActivity])

  const periodActivity = useMemo(
    () => filterActivityByDateRange(rawActivity, dateRange.start, dateRange.end),
    [dateRange.end, dateRange.start, rawActivity]
  )
  const summary = useMemo(
    () => summarizeActivityPeriod(periodActivity, sellPlLookup),
    [periodActivity, sellPlLookup]
  )
  const { buys, sells } = useMemo(() => splitActivityBySide(periodActivity), [periodActivity])
  const rangeLabel = useMemo(() => formatDateRangeLabel(dateRange.start, dateRange.end), [dateRange.end, dateRange.start])

  return (
    <PageShell>
      <div className="flex flex-wrap items-center justify-between gap-3 px-1">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Trading activity</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {rangeLabel} · {periodActivity.length} trade leg{periodActivity.length === 1 ? "" : "s"}
          </p>
          {isRefreshing ? (
            <p className="mt-0.5 text-xs text-muted-foreground">Syncing from brokers...</p>
          ) : null}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void fetchPortfolio({ refresh: true })}
          disabled={isRefreshing}
          className="gap-2 rounded-xl border-white/10 bg-white/[0.03]"
        >
          <RefreshCw className={isRefreshing ? "size-4 animate-spin" : "size-4"} />
          {isRefreshing ? "Syncing..." : "Refresh"}
        </Button>
      </div>

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
          <p className="mt-1 text-xs text-muted-foreground">Profit/loss on sells closed in this period</p>
        </div>
        <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-muted-foreground">Activity</p>
          <p className="mt-2 text-2xl font-semibold tracking-tight">{periodActivity.length}</p>
          <p className="mt-1 text-xs text-muted-foreground">{rawActivity.length} total legs loaded</p>
        </div>
      </section>

      {rawActivity.length === 0 ? (
        <Card className="border-dashed border-white/12 bg-white/[0.02]">
          <CardHeader>
            <CardTitle>No trading activity loaded</CardTitle>
            <CardDescription>Connect a broker and refresh to see buys and sells here.</CardDescription>
          </CardHeader>
        </Card>
      ) : periodActivity.length === 0 ? (
        <Card className="border-dashed border-white/12 bg-white/[0.02]">
          <CardHeader>
            <CardTitle>No trades in this period</CardTitle>
            <CardDescription>Try a wider date range or refresh from your brokers.</CardDescription>
          </CardHeader>
        </Card>
      ) : (
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
      )}
    </PageShell>
  )
}
