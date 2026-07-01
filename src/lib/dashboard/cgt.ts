import { buildTradeCycles } from "@/lib/dashboard/trade-cycles"
import type { PortfolioActivityEvent } from "@/types/portfolio"

export type UkTaxYear = {
  label: string
  start: Date
  end: Date
}

export type CgtDisposal = {
  ticker: string
  companyName: string
  broker: string
  disposalDate: string
  proceeds: number
  costBasis: number
  gainOrLoss: number
  isEstimate: boolean
}

export type CgtTaxYearSummary = {
  taxYear: string
  disposalCount: number
  totalProceeds: number
  totalGains: number
  totalLosses: number
  netGainOrLoss: number
  annualExemptionUsed: number
  start: Date
  end: Date
  disposals: CgtDisposal[]
}

const UK_ANNUAL_EXEMPT_AMOUNT_GBP = 3_000

function getUkTaxYearLabel(date: Date): string {
  const year = date.getFullYear()
  const month = date.getMonth()
  const day = date.getDate()
  const isAfterApril5 = month > 3 || (month === 3 && day >= 6)
  const taxYearStart = isAfterApril5 ? year : year - 1
  return `${taxYearStart}/${String(taxYearStart + 1).slice(2)}`
}

function getUkTaxYearStart(taxYearLabel: string): Date {
  const startYear = Number(taxYearLabel.split("/")[0])
  return new Date(startYear, 3, 6)
}

function getUkTaxYearEnd(taxYearLabel: string): Date {
  const startYear = Number(taxYearLabel.split("/")[0])
  return new Date(startYear + 1, 3, 5, 23, 59, 59, 999)
}

export function buildCgtSummariesByTaxYear(activity: PortfolioActivityEvent[]): CgtTaxYearSummary[] {
  const cycles = buildTradeCycles(activity).filter(
    (cycle) => cycle.sell && cycle.plGbp !== null
  )

  const byTaxYear = new Map<string, { disposals: CgtDisposal[] }>()

  for (const cycle of cycles) {
    if (!cycle.sell) continue
    const sellDate = new Date(cycle.sell.timestamp)
    const taxYear = getUkTaxYearLabel(sellDate)

    const proceeds = cycle.sell.grossAmountGbp
    const costBasis = Math.max(0, proceeds - (cycle.plGbp ?? 0))
    const gainOrLoss = cycle.plGbp ?? 0
    const isEstimate = cycle.sell.realisedProfitGbp === undefined

    const disposal: CgtDisposal = {
      ticker: cycle.ticker,
      companyName: cycle.companyName,
      broker: cycle.brokerLabel,
      disposalDate: cycle.sell.timestamp,
      proceeds,
      costBasis,
      gainOrLoss,
      isEstimate,
    }

    const existing = byTaxYear.get(taxYear) ?? { disposals: [] }
    existing.disposals.push(disposal)
    byTaxYear.set(taxYear, existing)
  }

  return Array.from(byTaxYear.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([taxYear, { disposals }]) => {
      const totalProceeds = disposals.reduce((sum, d) => sum + d.proceeds, 0)
      const totalGains = disposals.filter((d) => d.gainOrLoss > 0).reduce((sum, d) => sum + d.gainOrLoss, 0)
      const totalLosses = Math.abs(disposals.filter((d) => d.gainOrLoss < 0).reduce((sum, d) => sum + d.gainOrLoss, 0))
      const netGainOrLoss = totalGains - totalLosses
      const annualExemptionUsed = Math.min(Math.max(0, netGainOrLoss), UK_ANNUAL_EXEMPT_AMOUNT_GBP)

      return {
        taxYear,
        disposalCount: disposals.length,
        totalProceeds,
        totalGains,
        totalLosses,
        netGainOrLoss,
        annualExemptionUsed,
        start: getUkTaxYearStart(taxYear),
        end: getUkTaxYearEnd(taxYear),
        disposals: disposals.sort((a, b) => new Date(b.disposalDate).getTime() - new Date(a.disposalDate).getTime()),
      }
    })
}
