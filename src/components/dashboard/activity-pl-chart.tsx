"use client"

import { useMemo, useState } from "react"
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  buildPlPeriodSeries,
  getActivitySide,
  getSellPlGbp,
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

function PeriodTransactionsTable({
  events,
  sellPlLookup,
}: {
  events: PortfolioActivityEvent[]
  sellPlLookup: Map<string, number | null>
}) {
  if (events.length === 0) {
    return <p className="text-sm text-muted-foreground">No transactions in this period.</p>
  }

  return (
    <div className="max-h-[50vh] overflow-auto rounded-xl border border-white/8">
      <Table>
        <TableHeader className="sticky top-0 z-10 bg-card">
          <TableRow>
            <TableHead>Time</TableHead>
            <TableHead>Side</TableHead>
            <TableHead>Ticker</TableHead>
            <TableHead>Broker</TableHead>
            <TableHead className="text-right">Shares</TableHead>
            <TableHead className="text-right">Amount</TableHead>
            <TableHead className="text-right">P/L</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {events.map((event) => {
            const side = getActivitySide(event)
            const plGbp = side === "sell" ? getSellPlGbp(event, sellPlLookup) : null

            return (
              <TableRow key={event.id}>
                <TableCell className="text-xs">{formatShortDateTime(event.timestamp)}</TableCell>
                <TableCell>
                  <Badge variant="outline" className={side === "buy" ? "border-emerald-500/20 text-emerald-400" : "border-red-500/20 text-red-400"}>
                    {side}
                  </Badge>
                </TableCell>
                <TableCell className="text-xs font-medium">{event.ticker}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{event.brokerLabel}</TableCell>
                <TableCell className="text-right text-xs tabular-nums">{formatTradeShares(event.shares)}</TableCell>
                <TableCell className="text-right text-xs tabular-nums">{formatMoney(event.grossAmountGbp, "GBP")}</TableCell>
                <TableCell className="text-right text-xs tabular-nums">
                  {plGbp === null ? (
                    <span className="text-muted-foreground">—</span>
                  ) : (
                    <span className={plGbp >= 0 ? "text-emerald-400" : "text-red-400"}>{formatSignedMoney(plGbp)}</span>
                  )}
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
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
        <DialogContent className="max-w-4xl">
          {selectedBucket ? (
            <>
              <DialogHeader>
                <DialogTitle>{selectedBucket.label}</DialogTitle>
                <DialogDescription>
                  {selectedBucket.events.length} transaction{selectedBucket.events.length === 1 ? "" : "s"} · Bought {formatMoney(selectedBucket.totalBoughtGbp, "GBP")} · Sold {formatMoney(selectedBucket.totalSoldGbp, "GBP")}
                </DialogDescription>
              </DialogHeader>
              <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
                <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">Realised P/L</p>
                <p className={`mt-2 text-2xl font-semibold tabular-nums ${selectedBucket.realisedPlGbp >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                  {formatSignedMoney(selectedBucket.realisedPlGbp)}
                </p>
              </div>
              <PeriodTransactionsTable events={selectedBucket.events} sellPlLookup={sellPlLookup} />
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  )
}
