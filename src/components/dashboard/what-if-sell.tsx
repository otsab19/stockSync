"use client"

import { useMemo, useState } from "react"
import { combineTickerLots } from "@/lib/dashboard/averaging"
import { formatMoney } from "@/lib/dashboard/filter-engine"
import type { PortfolioPosition } from "@/types/portfolio"

type WhatIfSellProps = {
  positions: PortfolioPosition[]
  combinedPositions?: PortfolioPosition[]
  label?: string
}

function niceSliderRange(livePrice: number): { min: number; max: number; step: number } {
  const min = Math.max(livePrice * 0.3, 0.01)
  const max = livePrice * 2.5
  const range = max - min
  const step = Math.max(range / 300, 0.0001)
  return { min, max, step }
}

function roundTo(value: number, step: number): number {
  return Math.round(value / step) * step
}

type SellRowProps = {
  title: string
  value: number
  isPositive: boolean
  isZero: boolean
  currency: "GBP" | "USD"
}

function SellRow({ title, value, isPositive, isZero, currency }: SellRowProps) {
  const colorClass = isZero
    ? "text-muted-foreground"
    : isPositive
      ? "text-emerald-400"
      : "text-red-400"

  return (
    <div className="flex items-center justify-between gap-2 text-xs">
      <span className="text-muted-foreground">{title}</span>
      <span className={`tabular-nums font-medium ${colorClass}`}>
        {isPositive && !isZero ? "+" : ""}
        {formatMoney(value, currency)}
      </span>
    </div>
  )
}

export function WhatIfSell({ positions, combinedPositions, label }: WhatIfSellProps) {
  const aggregate = useMemo(() => combineTickerLots(positions), [positions])
  const combinedAggregate = useMemo(
    () =>
      combinedPositions && combinedPositions.length > positions.length
        ? combineTickerLots(combinedPositions)
        : null,
    [combinedPositions, positions]
  )

  const { min, max, step } = useMemo(
    () => (aggregate ? niceSliderRange(aggregate.livePrice) : { min: 0, max: 100, step: 0.01 }),
    [aggregate]
  )

  const [sellPrice, setSellPrice] = useState<number | null>(null)

  if (!aggregate || aggregate.livePrice <= 0) return null

  const effectiveSellPrice = sellPrice ?? aggregate.livePrice

  // Single-broker projection
  const sellValueAtPrice = aggregate.totalShares * effectiveSellPrice
  const costBasis = aggregate.totalShares * aggregate.avgPrice
  const plAtPrice = sellValueAtPrice - costBasis
  const plPercent = costBasis > 0 ? (plAtPrice / costBasis) * 100 : 0

  // Cross-broker / combined projection
  const fxFactor =
    combinedAggregate && combinedAggregate.currency !== aggregate.currency
      ? (positions[0].fxRateToGbp ?? 1)
      : 1
  const combinedSellValue = combinedAggregate
    ? combinedAggregate.totalShares * effectiveSellPrice * fxFactor
    : null
  const combinedCost = combinedAggregate
    ? combinedAggregate.totalShares * combinedAggregate.avgPrice
    : null
  const combinedPl =
    combinedSellValue !== null && combinedCost !== null ? combinedSellValue - combinedCost : null
  const combinedPlPercent =
    combinedCost && combinedCost > 0 && combinedPl !== null
      ? (combinedPl / combinedCost) * 100
      : null

  const priceVsLive = effectiveSellPrice - aggregate.livePrice
  const priceVsLivePercent =
    aggregate.livePrice > 0 ? (priceVsLive / aggregate.livePrice) * 100 : 0

  function handleSlider(e: React.ChangeEvent<HTMLInputElement>) {
    setSellPrice(Number(e.target.value))
  }

  function handleInput(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = parseFloat(e.target.value)
    if (!Number.isFinite(raw) || raw <= 0) {
      setSellPrice(null)
      return
    }
    setSellPrice(Math.min(Math.max(raw, 0.0001), max * 5))
  }

  const sliderValue = roundTo(Math.min(Math.max(effectiveSellPrice, min), max), step)

  return (
    <div className="space-y-3 rounded-xl border border-border bg-muted/40 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-foreground">{label ?? "What-if: sell at price"}</p>
        <p className="text-xs tabular-nums text-muted-foreground">
          Live {formatMoney(aggregate.livePrice, aggregate.currency)}
        </p>
      </div>

      {/* Slider + input row */}
      <div className="flex items-center gap-2">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={sliderValue}
          onChange={handleSlider}
          className="flex-1 accent-primary"
          aria-label="Hypothetical sell price (slider)"
        />
        <input
          type="number"
          min={0}
          step={step}
          value={effectiveSellPrice === aggregate.livePrice && sellPrice === null ? "" : effectiveSellPrice.toFixed(4)}
          placeholder={aggregate.livePrice.toFixed(4)}
          onChange={handleInput}
          className="w-24 rounded-lg border border-border bg-background px-2 py-1 text-right text-xs tabular-nums text-foreground outline-none focus:border-primary"
          aria-label="Hypothetical sell price (manual entry)"
        />
      </div>

      {/* Price delta chip */}
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => setSellPrice(null)}
          className={`rounded-lg border px-2 py-0.5 text-[0.65rem] tabular-nums transition-colors ${
            sellPrice === null
              ? "border-primary bg-primary/10 text-primary"
              : "border-border bg-background text-muted-foreground hover:text-foreground"
          }`}
        >
          Live price
        </button>
        <span
          className={`text-[0.65rem] tabular-nums ${
            priceVsLive > 0
              ? "text-emerald-400"
              : priceVsLive < 0
                ? "text-red-400"
                : "text-muted-foreground"
          }`}
        >
          {priceVsLive >= 0 ? "+" : ""}
          {priceVsLivePercent.toFixed(2)}% vs live
        </span>
      </div>

      {/* Projection rows */}
      <div className="space-y-1.5 pt-0.5">
        <SellRow
          title="Sell value"
          value={sellValueAtPrice}
          isPositive={sellValueAtPrice >= costBasis}
          isZero={false}
          currency={aggregate.currency}
        />
        <SellRow
          title="P&L at that price"
          value={plAtPrice}
          isPositive={plAtPrice > 0}
          isZero={Math.abs(plAtPrice) < 0.005}
          currency={aggregate.currency}
        />
        <div className="flex items-center justify-between gap-2 text-xs">
          <span className="text-muted-foreground">Return %</span>
          <span
            className={`tabular-nums font-medium ${
              Math.abs(plPercent) < 0.005
                ? "text-muted-foreground"
                : plPercent > 0
                  ? "text-emerald-400"
                  : "text-red-400"
            }`}
          >
            {plPercent >= 0 ? "+" : ""}
            {plPercent.toFixed(2)}%
          </span>
        </div>

        {combinedAggregate && combinedPl !== null && combinedPlPercent !== null ? (
          <>
            <div className="my-1 border-t border-border/50" />
            <SellRow
              title={
                combinedAggregate.brokerCount > 1
                  ? `Combined P&L (${combinedAggregate.brokerCount} brokers)`
                  : "Combined P&L (all lots)"
              }
              value={combinedPl}
              isPositive={combinedPl > 0}
              isZero={Math.abs(combinedPl) < 0.005}
              currency={combinedAggregate.currency}
            />
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="text-muted-foreground">Combined return %</span>
              <span
                className={`tabular-nums font-medium ${
                  Math.abs(combinedPlPercent) < 0.005
                    ? "text-muted-foreground"
                    : combinedPlPercent > 0
                      ? "text-emerald-400"
                      : "text-red-400"
                }`}
              >
                {combinedPlPercent >= 0 ? "+" : ""}
                {combinedPlPercent.toFixed(2)}%
              </span>
            </div>
          </>
        ) : null}

        {(aggregate.isFxNormalized || combinedAggregate?.isFxNormalized) ? (
          <p className="text-[0.65rem] text-muted-foreground">
            Mixed currencies normalized to GBP at today&apos;s FX rate (approximate).
          </p>
        ) : null}
      </div>
    </div>
  )
}
