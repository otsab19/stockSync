"use client"

import { useMemo } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { formatMoney } from "@/lib/dashboard/filter-engine"
import type { PortfolioPosition } from "@/types/portfolio"

type CrossBrokerTickerViewProps = {
  portfolio: PortfolioPosition[]
}

export function CrossBrokerTickerView({ portfolio }: CrossBrokerTickerViewProps) {
  const groups = useMemo(() => {
    const map = new Map<string, {
      ticker: string
      companyName: string
      totalShares: number
      totalValueGbp: number
      totalPlGbp: number
      brokers: Array<{ broker: string; brokerLabel: string; shares: number; valueGbp: number; plGbp: number }>
    }>()

    portfolio.forEach((position) => {
      const existing = map.get(position.ticker) ?? {
        ticker: position.ticker,
        companyName: position.companyName,
        totalShares: 0,
        totalValueGbp: 0,
        totalPlGbp: 0,
        brokers: [],
      }

      existing.totalShares += position.shares
      existing.totalValueGbp += position.normalizedTotalValueGbp
      existing.totalPlGbp += position.totalPL
      existing.brokers.push({
        broker: position.broker,
        brokerLabel: position.brokerLabel,
        shares: position.shares,
        valueGbp: position.normalizedTotalValueGbp,
        plGbp: position.totalPL,
      })
      map.set(position.ticker, existing)
    })

    return Array.from(map.values())
      .filter((group) => group.brokers.length > 1)
      .sort((left, right) => right.totalValueGbp - left.totalValueGbp)
  }, [portfolio])

  if (groups.length === 0) {
    return null
  }

  return (
    <Card className="border-border bg-muted/40">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Same ticker, multiple brokers</CardTitle>
        <CardDescription>Combined exposure when you hold the same symbol on more than one broker.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 md:grid-cols-2">
        {groups.map((group) => (
          <div key={group.ticker} className="rounded-lg border border-border bg-card p-4 card-shadow">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-semibold">{group.ticker}</p>
                <p className="text-xs text-muted-foreground">{group.companyName}</p>
              </div>
              <div className="text-right text-sm">
                <p className="font-medium tabular-nums">{formatMoney(group.totalValueGbp, "GBP")}</p>
                <p className={`text-xs tabular-nums ${group.totalPlGbp >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                  {group.totalPlGbp >= 0 ? "+" : ""}{formatMoney(group.totalPlGbp, "GBP")}
                </p>
              </div>
            </div>
            <div className="mt-3 space-y-2 text-xs text-muted-foreground">
              {group.brokers.map((broker) => (
                <div key={`${group.ticker}-${broker.broker}`} className="flex items-center justify-between gap-2">
                  <span>{broker.brokerLabel}</span>
                  <span className="tabular-nums">
                    {broker.shares} sh · {formatMoney(broker.valueGbp, "GBP")}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
