"use client"

import { useMemo } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { formatMoney } from "@/lib/dashboard/filter-engine"
import type { PortfolioActivityEvent } from "@/types/portfolio"

interface PlHeatmapProps {
  activity: PortfolioActivityEvent[]
}

interface DayCell {
  date: Date
  dateKey: string
  realisedPl: number
  tradeCount: number
  isCurrentMonth: boolean
}

function buildMonthlyHeatmap(activity: PortfolioActivityEvent[]): { year: number; month: number; cells: DayCell[] }[] {
  const plByDay = new Map<string, { realisedPl: number; tradeCount: number }>()

  for (const event of activity) {
    if (event.type !== "sell") continue
    const d = new Date(event.timestamp)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
    const cur = plByDay.get(key) ?? { realisedPl: 0, tradeCount: 0 }
    cur.realisedPl += event.realisedProfitGbp ?? 0
    cur.tradeCount += 1
    plByDay.set(key, cur)
  }

  if (plByDay.size === 0) return []

  const sortedKeys = Array.from(plByDay.keys()).sort()
  const firstDate = new Date(sortedKeys[0])
  const lastDate = new Date(sortedKeys[sortedKeys.length - 1])

  const months: { year: number; month: number; cells: DayCell[] }[] = []
  const cursor = new Date(firstDate.getFullYear(), firstDate.getMonth(), 1)
  const endMonth = new Date(lastDate.getFullYear(), lastDate.getMonth(), 1)

  while (cursor <= endMonth) {
    const year = cursor.getFullYear()
    const month = cursor.getMonth()
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    const cells: DayCell[] = []

    for (let day = 1; day <= daysInMonth; day++) {
      const d = new Date(year, month, day)
      const dateKey = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`
      const data = plByDay.get(dateKey)
      cells.push({
        date: d,
        dateKey,
        realisedPl: data?.realisedPl ?? 0,
        tradeCount: data?.tradeCount ?? 0,
        isCurrentMonth: true,
      })
    }

    months.push({ year, month, cells })
    cursor.setMonth(cursor.getMonth() + 1)
  }

  return months.slice(-12)
}

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

function getCellColor(pl: number, tradeCount: number): string {
  if (tradeCount === 0) return "bg-muted/40"
  if (pl > 500) return "bg-emerald-500"
  if (pl > 200) return "bg-emerald-400"
  if (pl > 50)  return "bg-emerald-300"
  if (pl > 0)   return "bg-emerald-200 dark:bg-emerald-900"
  if (pl > -50) return "bg-red-200 dark:bg-red-900"
  if (pl > -200) return "bg-red-300"
  if (pl > -500) return "bg-red-400"
  return "bg-red-500"
}

function MonthGrid({ year, month, cells }: { year: number; month: number; cells: DayCell[] }) {
  const firstDow = new Date(year, month, 1).getDay()
  const leadingBlanks = firstDow === 0 ? 6 : firstDow - 1

  return (
    <div className="min-w-0">
      <p className="mb-1.5 text-xs font-semibold text-muted-foreground">{MONTH_NAMES[month]} {year}</p>
      <div className="grid grid-cols-7 gap-0.5">
        {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
          <span key={i} className="flex h-5 items-center justify-center text-[0.6rem] font-medium text-muted-foreground/60">{d}</span>
        ))}
        {Array.from({ length: leadingBlanks }).map((_, i) => (
          <div key={`blank-${i}`} />
        ))}
        {cells.map((cell) => (
          <div
            key={cell.dateKey}
            title={cell.tradeCount > 0 ? `${cell.dateKey}: ${cell.tradeCount} sell${cell.tradeCount !== 1 ? "s" : ""}, P/L ${formatMoney(cell.realisedPl, "GBP")}` : cell.dateKey}
            className={`aspect-square rounded-sm ${getCellColor(cell.realisedPl, cell.tradeCount)} transition-opacity hover:opacity-80`}
          />
        ))}
      </div>
    </div>
  )
}

export function PlHeatmap({ activity }: PlHeatmapProps) {
  const months = useMemo(() => buildMonthlyHeatmap(activity), [activity])

  if (months.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>P/L calendar</CardTitle>
          <CardDescription>Daily realised P/L from sell activity.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex h-32 items-center justify-center rounded-lg border border-dashed border-border text-sm text-muted-foreground">
            Sync sell activity to see the P/L calendar.
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle>P/L calendar</CardTitle>
          <CardDescription>Daily realised P/L — darker green = bigger gain, darker red = bigger loss.</CardDescription>
        </div>
        <div className="flex shrink-0 items-center gap-1.5 pt-0.5">
          <span className="text-[0.65rem] text-muted-foreground">Loss</span>
          {["bg-red-400", "bg-red-200 dark:bg-red-900", "bg-muted/40", "bg-emerald-200 dark:bg-emerald-900", "bg-emerald-400"].map((c, i) => (
            <span key={i} className={`size-3 rounded-sm ${c}`} />
          ))}
          <span className="text-[0.65rem] text-muted-foreground">Gain</span>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid gap-5 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
          {months.map(({ year, month, cells }) => (
            <MonthGrid key={`${year}-${month}`} year={year} month={month} cells={cells} />
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
