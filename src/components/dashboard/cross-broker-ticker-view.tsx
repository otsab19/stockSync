"use client"

import { useMemo, useState } from "react"
import { ChevronDown, ChevronRight } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { WhatIfAverage } from "@/components/dashboard/what-if-average"
import { combineTickerLots, groupPositionsByTicker, type TickerAggregate } from "@/lib/dashboard/averaging"
import { formatMoney } from "@/lib/dashboard/filter-engine"
import type { PortfolioPosition } from "@/types/portfolio"

type CrossBrokerTickerViewProps = {
  portfolio: PortfolioPosition[]
}

type CrossBrokerGroup = {
  aggregate: TickerAggregate
  positions: PortfolioPosition[]
  totalValueGbp: number
  totalPlGbp: number
  brokerValues: Map<string, { valueGbp: number; plGbp: number }>
}

export function CrossBrokerTickerView({ portfolio }: CrossBrokerTickerViewProps) {
  const [expandedTicker, setExpandedTicker] = useState<string | null>(null)

  const groups = useMemo(() => {
    const result: CrossBrokerGroup[] = []

    for (const positions of groupPositionsByTicker(portfolio).values()) {
      const aggregate = combineTickerLots(positions)
      if (!aggregate || aggregate.brokerCount < 2) continue

      const brokerValues = new Map<string, { valueGbp: number; plGbp: number }>()
      for (const position of positions) {
        const entry = brokerValues.get(position.broker) ?? { valueGbp: 0, plGbp: 0 }
        entry.valueGbp += position.normalizedTotalValueGbp
        entry.plGbp += position.totalPL
        brokerValues.set(position.broker, entry)
      }

      result.push({
        aggregate,
        positions,
        totalValueGbp: positions.reduce((sum, position) => sum + position.normalizedTotalValueGbp, 0),
        totalPlGbp: positions.reduce((sum, position) => sum + position.totalPL, 0),
        brokerValues,
      })
    }

    return result.sort((left, right) => right.totalValueGbp - left.totalValueGbp)
  }, [portfolio])

  if (groups.length === 0) {
    return null
  }

  return (
    <Card className="border-border bg-muted/40">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Same ticker, multiple brokers</CardTitle>
        <CardDescription>Combined exposure and average cost when you hold the same symbol on more than one broker.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 md:grid-cols-2">
        {groups.map((group) => {
          const { aggregate } = group
          const expanded = expandedTicker === aggregate.ticker

          return (
            <div key={aggregate.ticker} className="rounded-lg border border-border bg-card p-4 card-shadow">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold">{aggregate.ticker}</p>
                  <p className="text-xs text-muted-foreground">{aggregate.companyName}</p>
                </div>
                <div className="text-right text-sm">
                  <p className="font-medium tabular-nums">{formatMoney(group.totalValueGbp, "GBP")}</p>
                  <p className={`text-xs tabular-nums ${group.totalPlGbp >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                    {group.totalPlGbp >= 0 ? "+" : ""}{formatMoney(group.totalPlGbp, "GBP")}
                  </p>
                </div>
              </div>

              <div className="mt-2 flex items-center justify-between gap-2 rounded-lg bg-muted/40 px-2 py-1.5 text-xs">
                <span className="text-muted-foreground">Combined avg cost</span>
                <span className="font-medium tabular-nums">
                  {formatMoney(aggregate.avgPrice, aggregate.currency)}
                  <span className="ml-1.5 font-normal text-muted-foreground">{aggregate.totalShares} sh</span>
                </span>
              </div>

              <div className="mt-3 space-y-2 text-xs text-muted-foreground">
                {aggregate.brokers.map((broker) => {
                  const values = group.brokerValues.get(broker.broker)
                  return (
                    <div key={`${aggregate.ticker}-${broker.broker}`} className="flex items-center justify-between gap-2">
                      <span>{broker.brokerLabel}</span>
                      <span className="tabular-nums">
                        {broker.shares} sh @ {formatMoney(broker.avgPrice, aggregate.currency)} · {formatMoney(values?.valueGbp ?? 0, "GBP")}
                      </span>
                    </div>
                  )
                })}
              </div>

              <button
                type="button"
                onClick={() => setExpandedTicker(expanded ? null : aggregate.ticker)}
                className="mt-3 flex items-center gap-1 text-xs font-medium text-primary hover:text-primary/80"
              >
                {expanded ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
                What-if: add money
              </button>
              {expanded ? (
                <div className="mt-2">
                  <WhatIfAverage positions={group.positions} label="New combined average" />
                </div>
              ) : null}
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}
