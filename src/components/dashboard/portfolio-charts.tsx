"use client"

import { useMemo, useState } from "react"
import { Pie, PieChart, Area, AreaChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import type { PortfolioInsights } from "@/types/portfolio"
import { formatMoney } from "@/lib/dashboard/filter-engine"

const timeRanges = ["1D", "1W", "1M", "3M", "YTD", "ALL"] as const
const donutColours = ["#34d399", "#60a5fa", "#f59e0b", "#a78bfa", "#f472b6", "#22d3ee"]

function formatChartCurrency(value: string | number | readonly (string | number)[] | undefined) {
  const numericValue = Array.isArray(value) ? Number(value[0] ?? 0) : Number(value ?? 0)
  return formatMoney(numericValue, "GBP")
}

interface PortfolioChartsProps {
  insights: PortfolioInsights
  onHighlightAsset?: (ticker: string | null) => void
}

export function PortfolioCharts({ insights, onHighlightAsset }: PortfolioChartsProps) {
  const [timeRange, setTimeRange] = useState<(typeof timeRanges)[number]>("1W")
  const [highlightedAllocation, setHighlightedAllocation] = useState<string | null>(null)

  const history = useMemo(() => {
    switch (timeRange) {
      case "1D":
        return insights.history.slice(-2)
      case "1W":
        return insights.history.slice(-7)
      case "1M":
      case "3M":
      case "YTD":
      case "ALL":
      default:
        return insights.history
    }
  }, [insights.history, timeRange])

  const hasHistory = history.length > 1
  const hasAllocation = insights.assetAllocation.length > 0
  const latestHistoryPoint = hasHistory ? history[history.length - 1] : null

  return (
    <div className="grid gap-4 xl:grid-cols-[1.8fr_1fr]">
      <Card className="border-white/10">
        <CardHeader className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-2">
            <CardTitle>Portfolio value</CardTitle>
            <CardDescription>{hasHistory ? "Recent portfolio value based on the data currently loaded in the dashboard." : "Historical tracking is not available yet for the current browser-mode dataset."}</CardDescription>
            {latestHistoryPoint ? (
              <p className="text-xs text-muted-foreground">
                Latest snapshot: <span className="font-medium text-foreground">{formatMoney(latestHistoryPoint.portfolioValueGbp, "GBP")}</span>
              </p>
            ) : null}
          </div>
          {hasHistory ? (
            <div className="flex flex-wrap gap-2 rounded-2xl border border-white/10 bg-white/[0.03] p-1">
              {timeRanges.map((range) => (
                <Button
                  key={range}
                  size="sm"
                  variant={timeRange === range ? "default" : "ghost"}
                  className={timeRange === range ? "rounded-xl" : "rounded-xl text-muted-foreground"}
                  onClick={() => setTimeRange(range)}
                >
                  {range}
                </Button>
              ))}
            </div>
          ) : null}
        </CardHeader>
        <CardContent className="h-[340px]">
          {hasHistory ? (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={history}>
                <defs>
                  <linearGradient id="portfolioArea" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#5eead4" stopOpacity={0.52} />
                    <stop offset="95%" stopColor="#5eead4" stopOpacity={0.03} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" vertical={false} />
                <XAxis dataKey="timestamp" tickLine={false} axisLine={false} tickMargin={10} tickFormatter={(value) => new Date(value).toLocaleDateString("en-GB", { month: "short", day: "numeric" })} />
                <YAxis tickLine={false} axisLine={false} width={72} tickFormatter={(value) => `£${Number(value ?? 0).toFixed(0)}`} />
                <Tooltip formatter={formatChartCurrency} labelFormatter={(value) => new Date(String(value)).toLocaleString()} />
                <Area type="monotone" dataKey="portfolioValueGbp" stroke="#5eead4" fill="url(#portfolioArea)" strokeWidth={2.5} />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-full items-center justify-center rounded-2xl border border-dashed border-white/10 bg-white/[0.02] text-center text-sm text-muted-foreground">
              Import or sync more than one snapshot to unlock portfolio history.
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-white/10">
        <CardHeader>
          <CardTitle>Asset allocation</CardTitle>
          <CardDescription>{hasAllocation ? "Breakdown of the current holdings loaded in the dashboard." : "No holdings are loaded yet."}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 lg:grid-cols-[1fr_auto] xl:grid-cols-1">
          <div className="h-[260px]">
            {hasAllocation ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={insights.assetAllocation}
                    dataKey="valueGbp"
                    nameKey="label"
                    innerRadius={60}
                    outerRadius={95}
                    paddingAngle={3}
                    onMouseEnter={(_, index) => {
                      const nextLabel = insights.assetAllocation[index]?.label ?? null
                      setHighlightedAllocation(nextLabel)
                      onHighlightAsset?.(nextLabel)
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
                        opacity={highlightedAllocation && highlightedAllocation !== entry.label ? 0.35 : 1}
                      />
                    ))}
                  </Pie>
                  <Tooltip formatter={formatChartCurrency} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center rounded-2xl border border-dashed border-white/10 bg-white/[0.02] text-center text-sm text-muted-foreground">
                Add positions to see the portfolio split.
              </div>
            )}
          </div>

          <div className="space-y-2">
            {hasAllocation ? insights.assetAllocation.map((entry, index) => (
              <div key={entry.label} className="flex items-center justify-between gap-3 rounded-2xl border border-white/8 bg-white/[0.03] px-3 py-2.5">
                <div className="flex items-center gap-2">
                  <span className="size-2 rounded-full" style={{ backgroundColor: donutColours[index % donutColours.length] }} />
                  <div>
                    <p className="text-sm font-medium">{entry.label}</p>
                    <p className="text-xs text-muted-foreground">{formatMoney(entry.valueGbp, "GBP")}</p>
                  </div>
                </div>
                <span className="text-xs text-muted-foreground">{entry.percentage.toFixed(1)}%</span>
              </div>
            )) : null}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

