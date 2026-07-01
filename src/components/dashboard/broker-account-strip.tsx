"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { formatMoney } from "@/lib/dashboard/filter-engine"
import type { PortfolioDataMeta } from "@/types/portfolio"

type BrokerAccountStripProps = {
  meta: PortfolioDataMeta | null | undefined
  portfolio: Array<{ broker: string; nativeTotalValue: number }>
}

function formatNullableMoney(value: number | null | undefined, currency: "GBP" | "USD") {
  if (value === null || value === undefined) {
    return "—"
  }

  return formatMoney(value, currency)
}

function BrokerAccountCard({
  brokerLabel,
  account,
  syncedHoldingsValue,
  syncedHoldingsCount,
}: {
  brokerLabel: string
  account: NonNullable<NonNullable<PortfolioDataMeta["brokerDetails"]>[number]["account"]>
  syncedHoldingsValue: number
  syncedHoldingsCount: number
}) {
  const displayCurrency = account.currency

  return (
    <Card className="border-border bg-muted/40">
      <CardHeader className="pb-2">
        <CardDescription>{brokerLabel} account</CardDescription>
        <CardTitle className="text-lg">Broker-reported totals</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <p className="text-xs text-muted-foreground">Available cash</p>
          <p className="font-medium tabular-nums">{formatNullableMoney(account.availableCash, displayCurrency)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Invested / cost basis</p>
          <p className="font-medium tabular-nums">{formatNullableMoney(account.investedAmount, displayCurrency)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Open holdings value</p>
          <p className="font-medium tabular-nums">{formatNullableMoney(account.holdingsValue, displayCurrency)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Total account value</p>
          <p className="font-medium tabular-nums">{formatNullableMoney(account.totalEquity, displayCurrency)}</p>
        </div>
        <div className="sm:col-span-2 rounded-xl border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
          Synced in app: {syncedHoldingsCount} lot{syncedHoldingsCount === 1 ? "" : "s"} ·{" "}
          {formatMoney(syncedHoldingsValue, displayCurrency)} open value from holdings table.
          {account.totalEquity !== null && account.holdingsValue !== null && Math.abs(account.totalEquity - account.holdingsValue) > 1 ? (
            <span> Broker equity can include cash and other exposure beyond synced lots.</span>
          ) : null}
        </div>
      </CardContent>
    </Card>
  )
}

export function BrokerAccountStrip({ meta, portfolio }: BrokerAccountStripProps) {
  const brokerDetails = meta?.brokerDetails ?? []
  const cards = brokerDetails
    .map((detail) => {
      if (!detail.account) {
        return null
      }

      const holdings = portfolio.filter((position) => position.broker === detail.broker)
      const syncedHoldingsValue = holdings.reduce((sum, position) => sum + position.nativeTotalValue, 0)

      return (
        <BrokerAccountCard
          key={detail.broker}
          brokerLabel={detail.broker === "t212" ? "Trading 212" : "eToro"}
          account={detail.account}
          syncedHoldingsCount={holdings.length}
          syncedHoldingsValue={syncedHoldingsValue}
        />
      )
    })
    .filter(Boolean)

  if (cards.length === 0) {
    return null
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {cards}
    </div>
  )
}
