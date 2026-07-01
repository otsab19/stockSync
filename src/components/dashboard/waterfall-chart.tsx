"use client"

import { useMemo } from "react"
import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { formatMoney } from "@/lib/dashboard/filter-engine"
import type { PortfolioPosition } from "@/types/portfolio"

interface WaterfallChartProps {
  portfolio: PortfolioPosition[]
}

interface WaterfallBar {
  ticker: string
  pl: number
  fill: string
}

const GRID_STROKE = "var(--border)"

export function WaterfallChart({ portfolio }: WaterfallChartProps) {
  const bars = useMemo<WaterfallBar[]>(() => {
    return portfolio
      .filter((p) => p.totalPL !== 0)
      .map((p) => ({ ticker: p.ticker, pl: p.totalPL, fill: p.totalPL >= 0 ? "#34d399" : "#f87171" }))
      .sort((a, b) => b.pl - a.pl)
      .slice(0, 20)
  }, [portfolio])

  const totalPl = bars.reduce((sum, b) => sum + b.pl, 0)

  if (bars.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>P/L attribution</CardTitle>
          <CardDescription>Which positions are driving your overall return.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex h-40 items-center justify-center rounded-lg border border-dashed border-border text-sm text-muted-foreground">
            Add positions to see P/L attribution.
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle>P/L attribution</CardTitle>
          <CardDescription>Unrealised gain/loss per position — sorted from best to worst. Top {bars.length} positions shown.</CardDescription>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-xs text-muted-foreground">Total unrealised</p>
          <p className={`text-lg font-bold tabular-nums ${totalPl >= 0 ? "text-emerald-500" : "text-red-500"}`}>
            {totalPl >= 0 ? "+" : ""}{formatMoney(totalPl, "GBP")}
          </p>
        </div>
      </CardHeader>
      <CardContent className="h-[280px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={bars} margin={{ top: 4, right: 4, left: 0, bottom: 24 }} barCategoryGap="18%">
            <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false} />
            <XAxis
              dataKey="ticker"
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 10 }}
              angle={-40}
              textAnchor="end"
              interval={0}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              width={68}
              tick={{ fontSize: 11 }}
              tickFormatter={(v) => `£${Number(v ?? 0).toFixed(0)}`}
            />
            <ReferenceLine y={0} stroke={GRID_STROKE} strokeWidth={1.5} />
            <Tooltip
              formatter={(value) => [`${Number(value) >= 0 ? "+" : ""}${formatMoney(Number(value), "GBP")}`, "Unrealised P/L"]}
              cursor={{ fill: "rgba(128,128,128,0.06)" }}
            />
            <Bar dataKey="pl" radius={[4, 4, 0, 0]} maxBarSize={32}>
              {bars.map((entry) => (
                <Cell key={entry.ticker} fill={entry.fill} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}
