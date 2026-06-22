"use client"

import { useMemo, useState } from "react"
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import {
  buildPlPeriodSeries,
  getActivitySide,
  getSellPlGbp,
  groupActivityByTickerAndBroker,
  type PlGroupBy,
  type PlPeriodBucket,
} from "@/lib/dashboard/activity-view"
import { formatMoney } from "@/lib/dashboard/filter-engine"
import type { PortfolioActivityEvent } from "@/types/portfolio"

const plGroupLabels: Record<PlGroupBy, string> = {
  day: "Day",
  week: "Week",
  month: "Month",
  year: "Year",
}

function formatSignedMoney(value: number) {
  return `${value >= 0 ? "+" : ""}${formatMoney(value, "GBP")}`
}

function formatShortDateTime(value: string) {
  return new Date(value).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function formatTradeShares(value: number) {
  return new Intl.NumberFormat("en-GB", { minimumFractionDigits: 0, maximumFractionDigits: 8 }).format(value)
}

function formatChartTick(label: string, groupBy: PlGroupBy) {
  if (groupBy === "year") return label
  if (groupBy === "month") {
    const [year, month] = label.split("-").map(Number)
    return new Intl.DateTimeFormat("en-GB", { month: "short", year: "2-digit" }).format(new Date(year, month - 1, 1))
  }
  const date = new Date(label)
  if (groupBy === "week") {
    return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" }).format(date)
  }
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" }).format(date)
}

function PeriodTransactionList({
  events,
  sellPlLookup,
}: {
  events: PortfolioActivityEvent[]
  sellPlLookup: Map<string, number | null>
}) {
  const tickerGroups = useMemo(
    () => groupActivityByTickerAndBroker(events, sellPlLookup),
    [events, sellPlLookup]
  )

  if (events.length === 0) {
    return <p className="text-sm text-muted-foreground">No transactions in this period.</p>
  }

  return (
    <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
      {tickerGroups.map((tickerGroup) => (
        <section key={tickerGroup.ticker} className="overflow-hidden rounded-2xl border border-white/8 bg-white/[0.02]">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/8 bg-white/[0.03] px-4 py-3">
            <div>
              <p className="text-sm font-semibold">{tickerGroup.ticker}</p>
              {tickerGroup.companyName.trim().toUpperCase() !== tickerGroup.ticker.trim().toUpperCase() ? (
                <p className="text-xs text-muted-foreground">{tickerGroup.companyName}</p>
              ) : null}
            </div>
            <p className={`text-sm font-semibold tabular-nums ${tickerGroup.totalRealisedPlGbp >= 0 ? "text-emerald-400" : "text-red-400"}`}>
              {formatSignedMoney(tickerGroup.totalRealisedPlGbp)}
            </p>
          </div>

          <div className="divide-y divide-white/6">
            {tickerGroup.brokers.map((brokerGroup) => (
              <div key={`${tickerGroup.ticker}:${brokerGroup.broker}`}>
                <div className="flex flex-wrap items-center justify-between gap-3 bg-white/[0.015] px-4 py-2.5">
                  <div className="text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">{brokerGroup.brokerLabel}</span>
                    <span className="ml-2">
                      {brokerGroup.buyCount} buy{brokerGroup.buyCount === 1 ? "" : "s"} · {brokerGroup.sellCount} sell{brokerGroup.sellCount === 1 ? "" : "s"}
                    </span>
                  </div>
                  <p className={`text-xs font-semibold tabular-nums ${brokerGroup.realisedPlGbp >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                    {formatSignedMoney(brokerGroup.realisedPlGbp)}
                  </p>
                </div>

                <div className="overflow-x-auto">
                  <div className="min-w-[48rem]">
                    <div className="grid grid-cols-[minmax(9rem,1.1fr)_4.5rem_minmax(5rem,0.7fr)_minmax(5.5rem,0.8fr)_minmax(5rem,0.7fr)] gap-3 border-b border-white/6 px-4 py-2 text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                      <span>Time</span>
                      <span>Side</span>
                      <span className="text-right">Shares</span>
                      <span className="text-right">Amount</span>
                      <span className="text-right">P/L</span>
                    </div>
                    {brokerGroup.events.map((event) => {
                      const side = getActivitySide(event)
                      const plGbp = side === "sell" ? getSellPlGbp(event, sellPlLookup) : null

                      return (
                        <div
                          key={event.id}
                          className="grid grid-cols-[minmax(9rem,1.1fr)_4.5rem_minmax(5rem,0.7fr)_minmax(5.5rem,0.8fr)_minmax(5rem,0.7fr)] items-center gap-3 border-b border-white/6 px-4 py-2.5 text-sm whitespace-nowrap last:border-b-0"
                        >
                          <span className="truncate text-xs text-muted-foreground">{formatShortDateTime(event.timestamp)}</span>
                          <span className={`text-xs font-semibold uppercase ${side === "buy" ? "text-emerald-400" : "text-red-400"}`}>
                            {side}
                          </span>
                          <span className="text-right text-xs tabular-nums">{formatTradeShares(event.shares)}</span>
                          <span className="text-right text-xs tabular-nums">{formatMoney(event.grossAmountGbp, "GBP")}</span>
                          <span className="text-right text-xs tabular-nums">
                            {plGbp === null ? (
                              <span className="text-muted-foreground">—</span>
                            ) : (
                              <span className={plGbp >= 0 ? "font-medium text-emerald-400" : "font-medium text-red-400"}>
                                {formatSignedMoney(plGbp)}
                              </span>
                            )}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}

export function ActivityPlChart({
  activity,
  sellPlLookup,
  rangeStart,
  rangeEnd,
}: {
  activity: PortfolioActivityEvent[]
  sellPlLookup: Map<string, number | null>
  rangeStart: Date
  rangeEnd: Date
}) {
  const [groupBy, setGroupBy] = useState<PlGroupBy>("day")
  const [selectedBucket, setSelectedBucket] = useState<PlPeriodBucket | null>(null)

  const series = useMemo(
    () => buildPlPeriodSeries(activity, sellPlLookup, groupBy, rangeStart, rangeEnd),
    [activity, groupBy, rangeEnd, rangeStart, sellPlLookup]
  )

  const totalPl = useMemo(
    () => series.reduce((sum, bucket) => sum + bucket.realisedPlGbp, 0),
    [series]
  )

  const chartData = useMemo(
    () => series.map((bucket) => ({
      ...bucket,
      chartLabel: formatChartTick(bucket.key, groupBy),
    })),
    [groupBy, series]
  )

  return (
    <>
      <Card className="border-white/10">
        <CardHeader className="gap-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <CardTitle>Realised P/L over time</CardTitle>
              <CardDescription>
                Profit and loss from closed sells in the selected range. Click a bar to see the transactions behind it.
              </CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(plGroupLabels) as PlGroupBy[]).map((value) => (
                <Button
                  key={value}
                  size="sm"
                  variant={groupBy === value ? "default" : "outline"}
                  className={groupBy === value ? "" : "rounded-xl border-white/10 bg-white/[0.03]"}
                  onClick={() => {
                    setGroupBy(value)
                    setSelectedBucket(null)
                  }}
                >
                  {plGroupLabels[value]}
                </Button>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className="text-muted-foreground">Range total</span>
            <span className={`font-semibold tabular-nums ${totalPl >= 0 ? "text-emerald-400" : "text-red-400"}`}>
              {formatSignedMoney(totalPl)}
            </span>
            <span className="text-xs text-muted-foreground">
              {series.filter((bucket) => bucket.events.length > 0).length} active period{series.filter((bucket) => bucket.events.length > 0).length === 1 ? "" : "s"}
            </span>
          </div>
        </CardHeader>
        <CardContent className="h-[320px]">
          {chartData.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              No periods in this date range.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" vertical={false} />
                <XAxis
                  dataKey="chartLabel"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={10}
                  minTickGap={16}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  width={72}
                  tickFormatter={(value) => `£${Number(value ?? 0).toFixed(0)}`}
                />
                <Tooltip
                  cursor={{ fill: "rgba(255,255,255,0.04)" }}
                  formatter={(value) => [formatSignedMoney(Number(value ?? 0)), "Realised P/L"]}
                  labelFormatter={(_, payload) => {
                    const bucket = payload?.[0]?.payload as PlPeriodBucket | undefined
                    return bucket?.label ?? ""
                  }}
                />
                <Bar
                  dataKey="realisedPlGbp"
                  radius={[8, 8, 0, 0]}
                  onClick={(data) => {
                    const bucket = (data as { payload?: PlPeriodBucket }).payload
                    if (bucket) setSelectedBucket(bucket)
                  }}
                  cursor="pointer"
                >
                  {chartData.map((entry) => (
                    <Cell
                      key={entry.key}
                      fill={entry.realisedPlGbp >= 0 ? "#34d399" : "#f87171"}
                      fillOpacity={selectedBucket?.key === entry.key ? 1 : 0.88}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <Dialog open={selectedBucket !== null} onOpenChange={(open) => !open && setSelectedBucket(null)}>
        <DialogContent className="flex max-h-[min(92vh,900px)] w-[min(96vw,76rem)] max-w-[96vw] flex-col gap-4 overflow-hidden p-5 sm:max-w-[76rem]">
          {selectedBucket ? (
            <>
              <DialogHeader>
                <DialogTitle>{selectedBucket.label}</DialogTitle>
                <DialogDescription>
                  Grouped by stock and broker. {selectedBucket.events.length} transaction{selectedBucket.events.length === 1 ? "" : "s"} · Bought {formatMoney(selectedBucket.totalBoughtGbp, "GBP")} · Sold {formatMoney(selectedBucket.totalSoldGbp, "GBP")}
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
                  <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">Realised P/L</p>
                  <p className={`mt-2 text-2xl font-semibold tabular-nums ${selectedBucket.realisedPlGbp >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                    {formatSignedMoney(selectedBucket.realisedPlGbp)}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                  <Badge variant="outline" className="border-emerald-500/20 text-emerald-400">
                    {selectedBucket.buyCount} buy{selectedBucket.buyCount === 1 ? "" : "s"}
                  </Badge>
                  <Badge variant="outline" className="border-red-500/20 text-red-400">
                    {selectedBucket.sellCount} sell{selectedBucket.sellCount === 1 ? "" : "s"}
                  </Badge>
                </div>
              </div>
              <PeriodTransactionList events={selectedBucket.events} sellPlLookup={sellPlLookup} />
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  )
}
