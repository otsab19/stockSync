"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { AlertTriangle, ChevronDown, ChevronRight, Download, RefreshCw } from "lucide-react"
import { PageHeader, PageShell } from "@/components/app/page-shell"
import { FreshnessBadge } from "@/components/dashboard/freshness-badge"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { buildCgtSummariesByTaxYear, type CgtDisposal, type CgtTaxYearSummary } from "@/lib/dashboard/cgt"
import { formatMoney } from "@/lib/dashboard/filter-engine"
import { createClientPortfolioRepository } from "@/lib/portfolio/client-factory"
import type { PortfolioApiResponse } from "@/types/portfolio"

function formatSignedMoney(value: number) {
  return `${value >= 0 ? "+" : ""}${formatMoney(Math.abs(value), "GBP")}`
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("en-GB", { year: "numeric", month: "short", day: "numeric" })
}

function PlCell({ value }: { value: number }) {
  return (
    <span className={`text-xs font-semibold tabular-nums ${value >= 0 ? "text-emerald-400" : "text-red-400"}`}>
      {value >= 0 ? "+" : ""}{formatMoney(Math.abs(value), "GBP")}
    </span>
  )
}

function TaxYearSection({ summary, defaultOpen }: { summary: CgtTaxYearSummary; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen ?? false)
  const hasEstimates = summary.disposals.some((d) => d.isEstimate)
  const netIsGain = summary.netGainOrLoss >= 0

  return (
    <Card className="border-white/10">
      <CardHeader
        className="cursor-pointer select-none"
        onClick={() => setOpen((v) => !v)}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            {open ? <ChevronDown className="size-4 shrink-0" /> : <ChevronRight className="size-4 shrink-0" />}
            <div>
              <CardTitle className="text-base">Tax year {summary.taxYear}</CardTitle>
              <CardDescription>{summary.disposalCount} disposal{summary.disposalCount === 1 ? "" : "s"}</CardDescription>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-4 text-right">
            <div>
              <p className="text-[0.65rem] uppercase tracking-[0.18em] text-muted-foreground">Proceeds</p>
              <p className="text-sm font-semibold tabular-nums">{formatMoney(summary.totalProceeds, "GBP")}</p>
            </div>
            <div>
              <p className="text-[0.65rem] uppercase tracking-[0.18em] text-muted-foreground">Net gain / loss</p>
              <p className={`text-sm font-semibold tabular-nums ${netIsGain ? "text-emerald-400" : "text-red-400"}`}>
                {formatSignedMoney(summary.netGainOrLoss)}
              </p>
            </div>
            <div>
              <p className="text-[0.65rem] uppercase tracking-[0.18em] text-muted-foreground">Annual exemption used</p>
              <p className="text-sm font-semibold tabular-nums">{formatMoney(summary.annualExemptionUsed, "GBP")}</p>
            </div>
            {hasEstimates && (
              <Badge variant="outline" className="border-amber-500/40 text-amber-400">
                Estimates included
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>

      {open && (
        <CardContent className="space-y-4 pt-0">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-white/8 bg-white/[0.02] p-3">
              <p className="text-[0.65rem] uppercase tracking-[0.18em] text-muted-foreground">Total gains</p>
              <p className="mt-1 text-lg font-semibold tabular-nums text-emerald-400">
                +{formatMoney(summary.totalGains, "GBP")}
              </p>
            </div>
            <div className="rounded-xl border border-white/8 bg-white/[0.02] p-3">
              <p className="text-[0.65rem] uppercase tracking-[0.18em] text-muted-foreground">Total losses</p>
              <p className="mt-1 text-lg font-semibold tabular-nums text-red-400">
                -{formatMoney(summary.totalLosses, "GBP")}
              </p>
            </div>
            <div className="rounded-xl border border-white/8 bg-white/[0.02] p-3">
              <p className="text-[0.65rem] uppercase tracking-[0.18em] text-muted-foreground">
                Net {netIsGain ? "gain" : "loss"}
              </p>
              <p className={`mt-1 text-lg font-semibold tabular-nums ${netIsGain ? "text-emerald-400" : "text-red-400"}`}>
                {formatSignedMoney(summary.netGainOrLoss)}
              </p>
            </div>
          </div>

          <div className="overflow-auto rounded-xl border border-white/8">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Asset</TableHead>
                  <TableHead>Broker</TableHead>
                  <TableHead className="text-right">Proceeds</TableHead>
                  <TableHead className="text-right">Cost basis</TableHead>
                  <TableHead className="text-right">Gain / Loss</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {summary.disposals.map((disposal, index) => (
                  <DisposalRow key={`${disposal.ticker}:${disposal.disposalDate}:${index}`} disposal={disposal} />
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      )}
    </Card>
  )
}

function DisposalRow({ disposal }: { disposal: CgtDisposal }) {
  return (
    <TableRow>
      <TableCell className="text-xs">{formatDate(disposal.disposalDate)}</TableCell>
      <TableCell>
        <span className="text-xs font-medium">{disposal.ticker}</span>
        {disposal.companyName !== disposal.ticker && (
          <span className="ml-1 text-[0.65rem] text-muted-foreground">{disposal.companyName}</span>
        )}
      </TableCell>
      <TableCell className="text-xs text-muted-foreground">{disposal.broker}</TableCell>
      <TableCell className="text-right text-xs tabular-nums">{formatMoney(disposal.proceeds, "GBP")}</TableCell>
      <TableCell className="text-right text-xs tabular-nums">{formatMoney(disposal.costBasis, "GBP")}</TableCell>
      <TableCell className="text-right">
        <PlCell value={disposal.gainOrLoss} />
      </TableCell>
      <TableCell className="text-right">
        {disposal.isEstimate && (
          <span className="text-[0.65rem] text-amber-400/80">est.</span>
        )}
      </TableCell>
    </TableRow>
  )
}

function downloadCsv(summaries: CgtTaxYearSummary[]) {
  const rows = [
    ["Tax year", "Date", "Asset", "Broker", "Proceeds (GBP)", "Cost basis (GBP)", "Gain/Loss (GBP)", "Estimate"],
  ]
  for (const summary of summaries) {
    for (const d of summary.disposals) {
      rows.push([
        summary.taxYear,
        formatDate(d.disposalDate),
        d.ticker,
        d.broker,
        d.proceeds.toFixed(2),
        d.costBasis.toFixed(2),
        d.gainOrLoss.toFixed(2),
        d.isEstimate ? "Yes" : "No",
      ])
    }
  }
  const csv = rows.map((row) => row.map((cell) => `"${cell}"`).join(",")).join("\n")
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = `cgt-summary-${new Date().toISOString().slice(0, 10)}.csv`
  link.click()
  URL.revokeObjectURL(url)
}

export default function TaxPage() {
  const [portfolioResponse, setPortfolioResponse] = useState<PortfolioApiResponse | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)

  const fetchPortfolio = useCallback(async ({ refresh = false }: { refresh?: boolean } = {}) => {
    try {
      if (refresh) setIsRefreshing(true)
      const repository = createClientPortfolioRepository()
      const data = await repository.getPortfolio({ refresh, includeActivity: true, preferCache: !refresh })
      setPortfolioResponse(data)
    } catch (error) {
      console.error("Failed to fetch portfolio for tax page:", error)
      setPortfolioResponse(null)
    } finally {
      setIsLoading(false)
      if (refresh) setIsRefreshing(false)
    }
  }, [])

  useEffect(() => {
    const id = window.setTimeout(() => { void fetchPortfolio() }, 0)
    return () => window.clearTimeout(id)
  }, [fetchPortfolio])

  const rawActivity = useMemo(() => {
    if (portfolioResponse?.status !== "ok") return []
    return portfolioResponse.activity ?? portfolioResponse.insights.activity ?? []
  }, [portfolioResponse])

  const summaries = useMemo(() => buildCgtSummariesByTaxYear(rawActivity), [rawActivity])
  const totalDisposals = summaries.reduce((sum, s) => sum + s.disposalCount, 0)
  const currentTaxYear = summaries.at(-1)

  if (isLoading) {
    return (
      <PageShell>
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <RefreshCw className="size-4 animate-spin" /> Loading trade history…
        </div>
      </PageShell>
    )
  }

  return (
    <PageShell>
      <PageHeader
        eyebrow="Tax"
        title="CGT estimate"
        description={`${totalDisposals} disposal${totalDisposals === 1 ? "" : "s"} across ${summaries.length} UK tax year${summaries.length === 1 ? "" : "s"}. Based on FIFO round-trip matching. Verify all figures with a qualified tax adviser before filing.`}
        badges={
          <FreshnessBadge meta={portfolioResponse?.meta} source={portfolioResponse?.source ?? "server"} />
        }
        actions={
          <div className="flex gap-2">
            {summaries.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => downloadCsv(summaries)}
                className="gap-2 rounded-xl border-white/10 bg-white/[0.03]"
              >
                <Download className="size-4" />
                Export CSV
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => void fetchPortfolio({ refresh: true })}
              disabled={isRefreshing}
              className="gap-2 rounded-xl border-white/10 bg-white/[0.03]"
            >
              <RefreshCw className={isRefreshing ? "size-4 animate-spin" : "size-4"} />
              {isRefreshing ? "Syncing…" : "Refresh"}
            </Button>
          </div>
        }
      />

      {/* Disclaimer */}
      <div className="flex items-start gap-3 rounded-2xl border border-amber-500/20 bg-amber-500/5 px-4 py-3">
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-400" />
        <p className="text-sm text-amber-300/90">
          <span className="font-semibold">Estimate only.</span> These figures use basic FIFO round-trip matching and
          do not apply UK same-day or 30-day bed-and-breakfast rules. UK annual exempt amount shown is £3,000 (2024/25 onwards).
          Always verify with a qualified accountant or tax adviser before filing your Self Assessment.
        </p>
      </div>

      {/* Current year KPI */}
      {currentTaxYear && (
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { label: "Current tax year", value: currentTaxYear.taxYear },
            {
              label: "Net gain / loss",
              value: formatSignedMoney(currentTaxYear.netGainOrLoss),
              coloured: true,
              positive: currentTaxYear.netGainOrLoss >= 0,
            },
            { label: "Total proceeds", value: formatMoney(currentTaxYear.totalProceeds, "GBP") },
            {
              label: "Exemption used",
              value: `${formatMoney(currentTaxYear.annualExemptionUsed, "GBP")} / £3,000`,
            },
          ].map((kpi) => (
            <div key={kpi.label} className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-muted-foreground">{kpi.label}</p>
              <p className={`mt-2 text-2xl font-semibold tracking-tight ${"coloured" in kpi && kpi.coloured ? (kpi.positive ? "text-emerald-400" : "text-red-400") : ""}`}>
                {kpi.value}
              </p>
            </div>
          ))}
        </section>
      )}

      {summaries.length === 0 ? (
        <Card className="border-white/10">
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No closed trades found. Sync your brokers and ensure trade history is loaded.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {[...summaries].reverse().map((summary, index) => (
            <TaxYearSection key={summary.taxYear} summary={summary} defaultOpen={index === 0} />
          ))}
        </div>
      )}
    </PageShell>
  )
}
