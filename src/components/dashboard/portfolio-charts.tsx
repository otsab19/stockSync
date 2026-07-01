"use client"

import { useMemo, useState } from "react"
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell,
  Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import type { PortfolioInsights, PortfolioPosition } from "@/types/portfolio"
import { formatMoney } from "@/lib/dashboard/filter-engine"

const timeRanges = ["1D", "1W", "1M", "3M", "YTD", "ALL"] as const
const donutColours = ["#34d399", "#60a5fa", "#f59e0b", "#a78bfa", "#f472b6", "#22d3ee"]
const GRID_STROKE = "var(--border)"

function formatChartCurrency(value: string | number | readonly (string | number)[] | undefined) {
  const numericValue = Array.isArray(value) ? Number(value[0] ?? 0) : Number(value ?? 0)
  return formatMoney(numericValue, "GBP")
}

interface PortfolioChartsProps {
  insights: PortfolioInsights
  portfolio?: PortfolioPosition[]
  onHighlightAsset?: (ticker: string | null) => void
}

export function PortfolioCharts({ insights, portfolio = [], onHighlightAsset }: PortfolioChartsProps) {
  const [timeRange, setTimeRange] = useState<(typeof timeRanges)[number]>("1W")
  const [highlightedAllocation, setHighlightedAllocation] = useState<string | null>(null)

  const history = useMemo(() => {
    switch (timeRange) {
      case "1D": return insights.history.slice(-2)
      case "1W": return insights.history.slice(-7)
      default:   return insights.history
    }
  }, [insights.history, timeRange])

  const hasHistory = history.length > 1
  const hasAllocation = insights.assetAllocation.length > 0
  const latestHistoryPoint = hasHistory ? history[history.length - 1] : null

  // Cost basis vs current value per ticker (top 12 by value)
  const costBasisData = useMemo(() => {
    return portfolio
      .filter((p) => p.normalizedTotalValueGbp > 0)
      .map((p) => ({
        ticker: p.ticker,
        costBasis: p.shares * p.avgPrice * p.fxRateToGbp,
        currentValue: p.normalizedTotalValueGbp,
        pl: p.totalPL,
      }))
      .sort((a, b) => b.currentValue - a.currentValue)
      .slice(0, 12)
  }, [portfolio])

  const hasCostBasis = costBasisData.length > 0

  return (
    <div className="space-y-4">
      {/* Row 1: Area chart + Donut */}
      <div className="grid gap-4 xl:grid-cols-[1.8fr_1fr]">
        <Card>
          <CardHeader className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-1">
              <CardTitle>Portfolio value over time</CardTitle>
              <CardDescription>
                {hasHistory
                  ? "Cumulative invested capital vs net-invested basis."
                  : "Sync data to unlock historical tracking."}
              </CardDescription>
              {latestHistoryPoint ? (
                <div className="flex items-center gap-3 pt-1">
                  <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span className="inline-block size-2.5 rounded-sm bg-primary/60" />
                    Value: <span className="font-semibold text-foreground">{formatMoney(latestHistoryPoint.portfolioValueGbp, "GBP")}</span>
                  </span>
                  <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span className="inline-block size-2.5 rounded-sm bg-amber-500/60" />
                    Invested: <span className="font-semibold text-foreground">{formatMoney(latestHistoryPoint.netInvestedGbp, "GBP")}</span>
                  </span>
                </div>
              ) : null}
            </div>
            {hasHistory ? (
              <div className="flex flex-wrap gap-1 rounded-lg border border-border bg-muted/40 p-1">
                {timeRanges.map((range) => (
                  <Button
                    key={range}
                    size="sm"
                    variant={timeRange === range ? "default" : "ghost"}
                    className="h-7 px-2.5 text-xs"
                    onClick={() => setTimeRange(range)}
                  >
                    {range}
                  </Button>
                ))}
              </div>
            ) : null}
          </CardHeader>
          <CardContent className="h-[300px]">
            {hasHistory ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={history} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="portfolioArea" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#34d399" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="#34d399" stopOpacity={0.02} />
                    </linearGradient>
                    <linearGradient id="investedArea" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#f59e0b" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false} />
                  <XAxis
                    dataKey="timestamp"
                    tickLine={false}
                    axisLine={false}
                    tickMargin={10}
                    tick={{ fontSize: 11 }}
                    tickFormatter={(v) => new Date(v).toLocaleDateString("en-GB", { month: "short", day: "numeric" })}
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    width={68}
                    tick={{ fontSize: 11 }}
                    tickFormatter={(v) => `£${Number(v ?? 0).toFixed(0)}`}
                  />
                  <Tooltip
                    formatter={(value, name) => [formatMoney(Number(value), "GBP"), name === "portfolioValueGbp" ? "Value" : "Invested"]}
                    labelFormatter={(v) => new Date(String(v)).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                  />
                  <Area type="monotone" dataKey="netInvestedGbp" stroke="#f59e0b" fill="url(#investedArea)" strokeWidth={1.5} strokeDasharray="4 3" dot={false} />
                  <Area type="monotone" dataKey="portfolioValueGbp" stroke="#34d399" fill="url(#portfolioArea)" strokeWidth={2.5} dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center rounded-lg border border-dashed border-border text-center text-sm text-muted-foreground">
                Import or sync data to unlock portfolio history.
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Asset allocation</CardTitle>
            <CardDescription>
              {hasAllocation ? "Current holdings breakdown." : "No holdings loaded yet."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="h-[200px]">
              {hasAllocation ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={insights.assetAllocation}
                      dataKey="valueGbp"
                      nameKey="label"
                      innerRadius={55}
                      outerRadius={88}
                      paddingAngle={2}
                      onMouseEnter={(_, index) => {
                        const next = insights.assetAllocation[index]?.label ?? null
                        setHighlightedAllocation(next)
                        onHighlightAsset?.(next)
                      }}
                      onMouseLeave={() => {
                        setHighlightedAllocation(null)
                        onHighlightAsset?.(null)
                      }}
                    >
                      {insights.assetAllocation.map((entry, index) => (
                        <Cell
                          key={entry.label}
                          fill={donutColours[index % donutColours.length]}
                          opacity={highlightedAllocation && highlightedAllocation !== entry.label ? 0.25 : 1}
                          stroke="transparent"
                        />
                      ))}
                    </Pie>
                    <Tooltip formatter={formatChartCurrency} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-full items-center justify-center rounded-lg border border-dashed border-border text-sm text-muted-foreground">
                  Add positions to see allocation.
                </div>
              )}
            </div>
            <div className="space-y-1.5">
              {insights.assetAllocation.slice(0, 6).map((entry, index) => (
                <div key={entry.label} className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: donutColours[index % donutColours.length] }} />
                    <span className="truncate text-xs font-medium">{entry.label}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs text-muted-foreground">{formatMoney(entry.valueGbp, "GBP")}</span>
                    <span className="w-10 text-right text-xs font-semibold">{entry.percentage.toFixed(1)}%</span>
                  </div>
                </div>
              ))}
              {insights.assetAllocation.length > 6 && (
                <p className="text-xs text-muted-foreground pt-1">+{insights.assetAllocation.length - 6} more positions</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Row 2: Cost basis vs current value horizontal bar chart */}
      {hasCostBasis ? (
        <Card>
          <CardHeader>
            <CardTitle>Cost basis vs current value</CardTitle>
            <CardDescription>Top positions — grey bar is cost paid, green/red extension is unrealised gain or loss.</CardDescription>
          </CardHeader>
          <CardContent style={{ height: `${Math.max(200, costBasisData.length * 36 + 40)}px` }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={costBasisData} layout="vertical" margin={{ top: 0, right: 16, left: 0, bottom: 0 }} barCategoryGap="28%">
                <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} horizontal={false} />
                <XAxis
                  type="number"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 11 }}
                  tickFormatter={(v) => `£${Number(v).toFixed(0)}`}
                />
                <YAxis
                  dataKey="ticker"
                  type="category"
                  tickLine={false}
                  axisLine={false}
                  width={56}
                  tick={{ fontSize: 11 }}
                />
                <Tooltip
                  formatter={(value, name) => [formatMoney(Number(value), "GBP"), name === "costBasis" ? "Cost basis" : "Current value"]}
                />
                <Legend
                  iconType="square"
                  iconSize={9}
                  wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
                  formatter={(value) => value === "costBasis" ? "Cost basis" : "Current value"}
                />
                <Bar dataKey="costBasis" fill="#6b7280" radius={[0, 3, 3, 0]} maxBarSize={16} />
                <Bar dataKey="currentValue" radius={[0, 3, 3, 0]} maxBarSize={16}>
                  {costBasisData.map((entry) => (
                    <Cell key={entry.ticker} fill={entry.pl >= 0 ? "#34d399" : "#f87171"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}

