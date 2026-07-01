import type { PortfolioActivityEvent } from "@/types/portfolio"

export type CashFlow = { date: Date; amount: number }

/**
 * Extended Internal Rate of Return (XIRR).
 * Newton–Raphson with a bisection fallback.
 * Flows: negative = cash out (buy), positive = cash in (sell / final value).
 */
export function computeXirr(flows: CashFlow[], guess = 0.1, maxIterations = 200, tolerance = 1e-7): number | null {
  if (flows.length < 2) return null
  const t0 = flows[0].date.getTime()
  const years = flows.map((f) => (f.date.getTime() - t0) / (365.25 * 24 * 3600 * 1000))

  function npv(rate: number) {
    return flows.reduce((sum, f, i) => sum + f.amount / Math.pow(1 + rate, years[i]), 0)
  }

  function dnpv(rate: number) {
    return flows.reduce((sum, f, i) => sum - (years[i] * f.amount) / Math.pow(1 + rate, years[i] + 1), 0)
  }

  let rate = guess
  for (let i = 0; i < maxIterations; i++) {
    const f = npv(rate)
    const df = dnpv(rate)
    if (Math.abs(df) < 1e-12) break
    const next = rate - f / df
    if (Math.abs(next - rate) < tolerance) return next
    rate = next
    if (!Number.isFinite(rate) || rate < -0.9999) {
      rate = -0.5 + Math.random() * 0.5
    }
  }

  // Bisection fallback
  let lo = -0.9999
  let hi = 10
  if (Math.sign(npv(lo)) === Math.sign(npv(hi))) return null
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2
    if (npv(mid) > 0) lo = mid
    else hi = mid
    if (hi - lo < tolerance) return (lo + hi) / 2
  }

  return null
}

/**
 * Time-Weighted Return using the Modified Dietz method per sub-period.
 * Returns the cumulative TWR as a decimal (e.g. 0.12 = +12%).
 */
export function computeTwr(flows: CashFlow[], finalValue: number): number | null {
  if (flows.length === 0) return null

  const sorted = [...flows].sort((a, b) => a.date.getTime() - b.date.getTime())
  let cumulativeReturn = 1

  for (let i = 0; i < sorted.length - 1; i++) {
    const begin = sorted[i].amount
    const end = sorted[i + 1].amount
    const periodDays = (sorted[i + 1].date.getTime() - sorted[i].date.getTime()) / (24 * 3600 * 1000)
    if (periodDays < 0.5 || begin === 0) continue
    const periodReturn = (end - begin) / Math.abs(begin)
    if (!Number.isFinite(periodReturn)) continue
    cumulativeReturn *= 1 + periodReturn
  }

  const last = sorted.at(-1)
  if (!last || last.amount === 0) return null
  const finalPeriodReturn = (finalValue - last.amount) / Math.abs(last.amount)
  cumulativeReturn *= 1 + finalPeriodReturn

  return cumulativeReturn - 1
}

export type PortfolioAnalytics = {
  xirr: number | null
  xirrPercent: number | null
  twr: number | null
  twrPercent: number | null
  totalInvested: number
  totalProceeds: number
  totalRealised: number
  holdingPeriodDays: number | null
}

/**
 * Build XIRR cash flows from activity events + current portfolio value.
 * Buys are negative flows (cash out), sells are positive (cash in).
 * Current holdings value is the terminal positive flow.
 */
export function buildXirrFlows(
  activity: PortfolioActivityEvent[],
  currentValueGbp: number
): CashFlow[] {
  const flows: CashFlow[] = activity
    .filter((e) => e.type === "buy" || e.type === "sell")
    .map((e) => ({
      date: new Date(e.timestamp),
      amount: e.type === "buy" ? -e.grossAmountGbp : e.grossAmountGbp,
    }))
    .filter((f) => Number.isFinite(f.amount) && f.amount !== 0)
    .sort((a, b) => a.date.getTime() - b.date.getTime())

  if (flows.length === 0) return []

  flows.push({ date: new Date(), amount: currentValueGbp })
  return flows
}

export function buildPortfolioAnalytics(
  activity: PortfolioActivityEvent[],
  currentValueGbp: number
): PortfolioAnalytics {
  const tradeActivity = activity.filter((e) => e.type === "buy" || e.type === "sell")
  const totalInvested = tradeActivity
    .filter((e) => e.type === "buy")
    .reduce((sum, e) => sum + e.grossAmountGbp, 0)
  const totalProceeds = tradeActivity
    .filter((e) => e.type === "sell")
    .reduce((sum, e) => sum + e.grossAmountGbp, 0)
  const totalRealised = tradeActivity
    .filter((e) => e.type === "sell" && e.realisedProfitGbp !== undefined)
    .reduce((sum, e) => sum + (e.realisedProfitGbp ?? 0), 0)

  const sorted = tradeActivity.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
  const firstDate = sorted[0] ? new Date(sorted[0].timestamp) : null
  const holdingPeriodDays = firstDate
    ? Math.round((Date.now() - firstDate.getTime()) / (24 * 3600 * 1000))
    : null

  const flows = buildXirrFlows(activity, currentValueGbp)
  const xirr = flows.length >= 2 ? computeXirr(flows) : null

  const portfolioFlows: CashFlow[] = flows.map((f, i) =>
    i === flows.length - 1 ? f : { date: f.date, amount: Math.abs(f.amount) }
  )
  const twr = portfolioFlows.length >= 2 ? computeTwr(portfolioFlows.slice(0, -1), currentValueGbp) : null

  return {
    xirr,
    xirrPercent: xirr !== null ? xirr * 100 : null,
    twr,
    twrPercent: twr !== null ? twr * 100 : null,
    totalInvested,
    totalProceeds,
    totalRealised,
    holdingPeriodDays,
  }
}
