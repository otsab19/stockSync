"use client"

import { useMemo, useState } from "react"
import { combineTickerLots, projectNewAverage } from "@/lib/dashboard/averaging"
import { formatMoney } from "@/lib/dashboard/filter-engine"
import type { PortfolioPosition } from "@/types/portfolio"

type WhatIfAverageProps = {
  positions: PortfolioPosition[]
  combinedPositions?: PortfolioPosition[]
  label?: string
}

const PRESET_AMOUNTS = [100, 250, 500, 1000, 2500]

function niceSliderMax(currentValue: number) {
  const target = Math.max(currentValue * 2, 1000)
  const magnitude = 10 ** Math.floor(Math.log10(target))
  return Math.ceil(target / magnitude) * magnitude
}

function ProjectionRow({
  title,
  currentAvg,
  newAvg,
  avgChangePercent,
  currency,
}: {
  title: string
  currentAvg: number
  newAvg: number
  avgChangePercent: number
  currency: "GBP" | "USD"
}) {
  const lowered = avgChangePercent < 0
  return (
    <div className="flex items-center justify-between gap-2 text-xs">
      <span className="text-muted-foreground">{title}</span>
      <span className="tabular-nums">
        {formatMoney(currentAvg, currency)}
        <span className="mx-1 text-muted-foreground">→</span>
        <span className="font-medium text-foreground">{formatMoney(newAvg, currency)}</span>
        <span className={`ml-1.5 ${lowered ? "text-emerald-400" : avgChangePercent > 0 ? "text-red-400" : "text-muted-foreground"}`}>
          {avgChangePercent > 0 ? "+" : ""}{avgChangePercent.toFixed(2)}%
        </span>
      </span>
    </div>
  )
}

export function WhatIfAverage({ positions, combinedPositions, label }: WhatIfAverageProps) {
  const [amount, setAmount] = useState(0)
  const [customPrice, setCustomPrice] = useState<string>("")

  const aggregate = useMemo(() => combineTickerLots(positions), [positions])
  const combinedAggregate = useMemo(
    () => (combinedPositions && combinedPositions.length > positions.length ? combineTickerLots(combinedPositions) : null),
    [combinedPositions, positions]
  )

  if (!aggregate || aggregate.livePrice <= 0) {
    return null
  }

  const buyPrice = customPrice === "" ? aggregate.livePrice : Number(customPrice)
  const isCustomPrice = customPrice !== "" && Number(customPrice) !== aggregate.livePrice
  const currentValue = aggregate.totalShares * aggregate.livePrice
  const sliderMax = niceSliderMax(currentValue)
  const sliderStep = Math.max(sliderMax / 200, 1)

  const projection = projectNewAverage({
    totalShares: aggregate.totalShares,
    avgPrice: aggregate.avgPrice,
    buyAmount: amount,
    buyPrice: buyPrice,
  })

  const fxToCombined = combinedAggregate && combinedAggregate.currency !== aggregate.currency
    ? positions[0].fxRateToGbp
    : 1
  const combinedProjection = combinedAggregate
    ? projectNewAverage({
        totalShares: combinedAggregate.totalShares,
        avgPrice: combinedAggregate.avgPrice,
        buyAmount: amount * fxToCombined,
        buyPrice: buyPrice * fxToCombined,
      })
    : null

  return (
    <div className="space-y-3 rounded-xl border border-border bg-muted/40 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-foreground">{label ?? "What-if: add money"}</p>
        <p className="text-xs tabular-nums text-muted-foreground">
          Market: {formatMoney(aggregate.livePrice, aggregate.currency)}
        </p>
      </div>

      <div className="flex items-center gap-2">
        <input
          type="range"
          min={0}
          max={sliderMax}
          step={sliderStep}
          value={amount}
          onChange={(event) => setAmount(Number(event.target.value))}
          className="flex-1 accent-primary"
          aria-label="Amount to invest"
        />
        <input
          type="number"
          min={0}
          max={sliderMax}
          step={sliderStep}
          value={amount === 0 ? "" : amount}
          placeholder="0"
          onChange={(event) => {
            const val = Number(event.target.value)
            setAmount(Number.isFinite(val) && val >= 0 ? Math.min(val, sliderMax) : 0)
          }}
          className="w-24 rounded-lg border border-border bg-background px-2 py-1 text-right text-xs tabular-nums text-foreground outline-none focus:border-primary"
          aria-label="Amount to invest (manual entry)"
        />
      </div>

      <div className="flex items-center gap-2">
        <label className="shrink-0 text-xs text-muted-foreground">Buy price</label>
        <div className="flex flex-1 items-center justify-end gap-1.5">
          {isCustomPrice ? (
            <button
              type="button"
              onClick={() => setCustomPrice("")}
              className="rounded-md border border-border bg-background px-1.5 py-0.5 text-[0.65rem] text-muted-foreground transition-colors hover:border-primary hover:text-primary"
              title="Reset to market price"
            >
              ↺ market
            </button>
          ) : (
            <span className="rounded-md border border-primary/30 bg-primary/5 px-1.5 py-0.5 text-[0.65rem] text-primary">
              market
            </span>
          )}
          <input
            type="number"
            step="0.01"
            min={0.0001}
            value={customPrice}
            placeholder={aggregate.livePrice.toFixed(2)}
            onChange={(e) => setCustomPrice(e.target.value)}
            onBlur={() => {
              const n = Number(customPrice)
              if (!Number.isFinite(n) || n <= 0) setCustomPrice("")
            }}
            className={`w-28 rounded-lg border bg-background px-2 py-1 text-right text-xs tabular-nums text-foreground outline-none transition-colors focus:border-primary ${
              isCustomPrice ? "border-primary/50" : "border-border"
            }`}
            aria-label="Buy price"
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {PRESET_AMOUNTS.map((preset) => (
          <button
            key={preset}
            type="button"
            onClick={() => setAmount(preset)}
            className={`rounded-lg border px-2 py-0.5 text-[0.65rem] tabular-nums transition-colors ${
              amount === preset
                ? "border-primary bg-primary/10 text-primary"
                : "border-border bg-background text-muted-foreground hover:text-foreground"
            }`}
          >
            {formatMoney(preset, aggregate.currency)}
          </button>
        ))}
        {amount > 0 ? (
          <button
            type="button"
            onClick={() => setAmount(0)}
            className="rounded-lg border border-border bg-background px-2 py-0.5 text-[0.65rem] text-muted-foreground hover:text-foreground"
          >
            Reset
          </button>
        ) : null}
      </div>

      {projection ? (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="text-muted-foreground">Adding {formatMoney(amount, aggregate.currency)} at {formatMoney(buyPrice, aggregate.currency)}</span>
            <span className="tabular-nums text-muted-foreground">
              +{projection.newShares.toFixed(4)} sh · {projection.newTotalShares.toFixed(4)} sh total
            </span>
          </div>
          <ProjectionRow
            title="New avg cost"
            currentAvg={aggregate.avgPrice}
            newAvg={projection.newAvg}
            avgChangePercent={projection.avgChangePercent}
            currency={aggregate.currency}
          />
          {combinedAggregate && combinedProjection ? (
            <ProjectionRow
              title={combinedAggregate.brokerCount > 1 ? `Combined avg (${combinedAggregate.brokerCount} brokers)` : "Combined avg (all lots)"}
              currentAvg={combinedAggregate.avgPrice}
              newAvg={combinedProjection.newAvg}
              avgChangePercent={combinedProjection.avgChangePercent}
              currency={combinedAggregate.currency}
            />
          ) : null}
          {(aggregate.isFxNormalized || combinedAggregate?.isFxNormalized) ? (
            <p className="text-[0.65rem] text-muted-foreground">
              Mixed currencies normalized to GBP at today&apos;s FX rate (approximate).
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
