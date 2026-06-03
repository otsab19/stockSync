"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Brain, RefreshCw } from "lucide-react"
import { PageShell } from "@/components/app/page-shell"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

type LlmAnalysis = {
  id: string
  ticker: string
  companyName: string
  broker: string | null
  analysisDate: string
  provider: string
  model: string
  recommendation: string
  confidence: number | null
  horizon: string | null
  thesis: string | null
  risks: string | null
  prompt: string | null
  rawOutput: unknown
  createdAt: string
  updatedAt: string
}

type AnalysisResponse = {
  analyses?: LlmAnalysis[]
  message?: string
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function formatConfidence(value: number | null) {
  if (value === null) return "—"
  return value <= 1 ? `${Math.round(value * 100)}%` : `${value.toFixed(0)}%`
}

function getRecommendationClassName(recommendation: string) {
  const normalized = recommendation.toLowerCase()
  if (["buy", "bullish", "strong_buy", "strong buy"].includes(normalized)) return "border-emerald-500/20 text-emerald-400"
  if (["sell", "bearish", "strong_sell", "strong sell"].includes(normalized)) return "border-red-500/20 text-red-400"
  if (["hold", "neutral", "watch"].includes(normalized)) return "border-amber-500/20 text-amber-300"
  return "border-white/10 text-muted-foreground"
}

function hasRawOutput(value: unknown) {
  if (value === null || value === undefined) return false
  if (Array.isArray(value)) return value.length > 0
  if (typeof value === "object") return Object.keys(value).length > 0
  return true
}

export default function DashboardAnalysisPage() {
  const [analyses, setAnalyses] = useState<LlmAnalysis[]>([])
  const [message, setMessage] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)

  const loadAnalyses = useCallback(async (mode: "initial" | "refresh" = "initial") => {
    try {
      if (mode === "refresh") setIsRefreshing(true)
      const response = await fetch("/api/llm-analyses", { cache: "no-store" })
      const payload = await response.json() as AnalysisResponse

      if (!response.ok) {
        setMessage(payload.message ?? "Failed to load LLM analyses.")
        setAnalyses([])
        return
      }

      setAnalyses(payload.analyses ?? [])
      setMessage(payload.message ?? null)
    } catch (error) {
      console.error("Failed to load LLM analyses:", error)
      setMessage("Failed to load LLM analyses.")
      setAnalyses([])
    } finally {
      setIsLoading(false)
      setIsRefreshing(false)
    }
  }, [])

  useEffect(() => {
    const timeoutId = window.setTimeout(() => { void loadAnalyses() }, 0)
    return () => { window.clearTimeout(timeoutId) }
  }, [loadAnalyses])

  const latestAnalysis = analyses[0] ?? null
  const analyzedTickers = useMemo(() => new Set(analyses.map((analysis) => analysis.ticker)).size, [analyses])
  const ollamaCount = useMemo(
    () => analyses.filter((analysis) => analysis.provider.toLowerCase() === "ollama").length,
    [analyses]
  )

  return (
    <PageShell>
      <div className="flex flex-wrap items-center justify-between gap-3 px-1">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">LLM analysis</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Saved local Ollama and LLM research runs for your portfolio.
          </p>
          {message ? <p className="mt-0.5 text-xs text-red-400">{message}</p> : null}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void loadAnalyses("refresh")}
          disabled={isRefreshing}
          className="gap-2 rounded-xl border-white/10 bg-white/[0.03]"
        >
          <RefreshCw className={isRefreshing ? "size-4 animate-spin" : "size-4"} />
          {isRefreshing ? "Refreshing..." : "Refresh"}
        </Button>
      </div>

      <section className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-muted-foreground">Analyses</p>
          <p className="mt-2 text-2xl font-semibold tracking-tight">{analyses.length}</p>
          <p className="mt-1 text-xs text-muted-foreground">Latest 100 saved rows</p>
        </div>
        <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-muted-foreground">Tickers</p>
          <p className="mt-2 text-2xl font-semibold tracking-tight">{analyzedTickers}</p>
          <p className="mt-1 text-xs text-muted-foreground">Distinct symbols analysed</p>
        </div>
        <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-muted-foreground">Ollama runs</p>
          <p className="mt-2 text-2xl font-semibold tracking-tight">{ollamaCount}</p>
          <p className="mt-1 text-xs text-muted-foreground">{latestAnalysis ? `Latest ${formatDateTime(latestAnalysis.createdAt)}` : "No runs yet"}</p>
        </div>
      </section>

      {isLoading ? (
        <Card className="border-white/10">
          <CardHeader>
            <CardTitle>Loading analysis</CardTitle>
            <CardDescription>Reading saved LLM analysis rows from Supabase.</CardDescription>
          </CardHeader>
        </Card>
      ) : analyses.length === 0 ? (
        <Card className="border-dashed border-white/12 bg-white/[0.02]">
          <CardHeader>
            <CardTitle>No LLM analysis saved yet</CardTitle>
            <CardDescription>
              Run your local Ollama analysis and insert rows into `llm_analyses`, or POST results to `/api/llm-analyses`.
            </CardDescription>
          </CardHeader>
          <CardContent className="rounded-2xl border border-white/8 bg-white/[0.03] p-4 text-xs text-muted-foreground">
            <code>{`POST /api/llm-analyses { "ticker": "RR", "model": "llama3.1", "recommendation": "hold", "thesis": "..." }`}</code>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          <Card className="border-white/10">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <span className="flex size-8 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary">
                  <Brain className="size-4" />
                </span>
                <div>
                  <CardTitle className="text-base">Saved analysis runs</CardTitle>
                  <CardDescription>Newest analyses first.</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Ticker</TableHead>
                    <TableHead>Recommendation</TableHead>
                    <TableHead>Model</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">Confidence</TableHead>
                    <TableHead>Saved</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {analyses.map((analysis) => (
                    <TableRow key={analysis.id}>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="font-medium">{analysis.ticker}</span>
                          <span className="text-xs text-muted-foreground">{analysis.companyName || analysis.broker || "—"}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={getRecommendationClassName(analysis.recommendation)}>
                          {analysis.recommendation}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="text-xs">{analysis.model}</span>
                          <span className="text-xs text-muted-foreground">{analysis.provider}{analysis.horizon ? ` · ${analysis.horizon}` : ""}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-xs">{formatDate(analysis.analysisDate)}</TableCell>
                      <TableCell className="text-right text-xs tabular-nums">{formatConfidence(analysis.confidence)}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{formatDateTime(analysis.createdAt)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            {analyses.map((analysis) => (
              <Card key={`${analysis.id}:details`} className="border-white/10">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <CardTitle className="text-base">{analysis.ticker} analysis</CardTitle>
                      <CardDescription>
                        {analysis.provider} · {analysis.model} · {formatDate(analysis.analysisDate)}
                      </CardDescription>
                    </div>
                    <Badge variant="outline" className={getRecommendationClassName(analysis.recommendation)}>
                      {analysis.recommendation}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Thesis</p>
                    <p className="mt-1 whitespace-pre-wrap text-sm leading-6">{analysis.thesis || "No thesis saved."}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Risks</p>
                    <p className="mt-1 whitespace-pre-wrap text-sm leading-6">{analysis.risks || "No risks saved."}</p>
                  </div>
                  {hasRawOutput(analysis.rawOutput) ? (
                    <details className="rounded-2xl border border-white/8 bg-white/[0.02] p-3">
                      <summary className="cursor-pointer text-xs font-medium text-muted-foreground">Raw output</summary>
                      <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap text-xs">{JSON.stringify(analysis.rawOutput, null, 2)}</pre>
                    </details>
                  ) : null}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}
    </PageShell>
  )
}
