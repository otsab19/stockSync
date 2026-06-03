import { NextResponse } from "next/server"
import { createClient, createServiceRoleClient } from "@/utils/supabase/server"
import type { Json } from "@/types/supabase"

type LlmAnalysisRow = {
  id: string
  ticker: string
  company_name: string
  broker: string | null
  analysis_date: string
  provider: string
  model: string
  recommendation: string
  confidence: number | string | null
  horizon: string | null
  thesis: string | null
  risks: string | null
  prompt: string | null
  raw_output: Json
  created_at: string
  updated_at: string
}

type LlmAnalysisRequest = {
  ticker?: string
  companyName?: string
  broker?: string | null
  analysisDate?: string
  provider?: string
  model?: string
  recommendation?: string
  confidence?: number | null
  horizon?: string | null
  thesis?: string | null
  risks?: string | null
  prompt?: string | null
  rawOutput?: unknown
}

function toNumberOrNull(value: number | string | null) {
  if (value === null) return null
  const parsed = typeof value === "number" ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function toSerializableJson(value: unknown): Json {
  if (value === undefined) return {}
  return JSON.parse(JSON.stringify(value)) as Json
}

function mapAnalysisRow(row: LlmAnalysisRow) {
  return {
    id: row.id,
    ticker: row.ticker,
    companyName: row.company_name,
    broker: row.broker,
    analysisDate: row.analysis_date,
    provider: row.provider,
    model: row.model,
    recommendation: row.recommendation,
    confidence: toNumberOrNull(row.confidence),
    horizon: row.horizon,
    thesis: row.thesis,
    risks: row.risks,
    prompt: row.prompt,
    rawOutput: row.raw_output,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

async function getAuthenticatedClient() {
  const supabase = await createClient()
  if (!supabase) {
    return { error: NextResponse.json({ message: "Supabase not configured." }, { status: 503 }) }
  }

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { error: NextResponse.json({ message: "Unauthorized." }, { status: 401 }) }
  }

  return { supabase, user }
}

async function getAnalysisInsertClient(request: Request) {
  const ingestKey = request.headers.get("x-local-ingest-key")

  if (ingestKey) {
    const expectedKey = process.env.LLM_ANALYSIS_INGEST_KEY
    const ingestUserId = process.env.LLM_ANALYSIS_INGEST_USER_ID

    if (!expectedKey || !ingestUserId) {
      return { error: NextResponse.json({ message: "Local LLM ingest is not configured." }, { status: 503 }) }
    }

    if (ingestKey !== expectedKey) {
      return { error: NextResponse.json({ message: "Invalid local ingest key." }, { status: 401 }) }
    }

    const supabase = createServiceRoleClient()
    if (!supabase) {
      return { error: NextResponse.json({ message: "Supabase service role key is missing." }, { status: 503 }) }
    }

    return { supabase, userId: ingestUserId }
  }

  const auth = await getAuthenticatedClient()
  if (auth.error) return { error: auth.error }

  return { supabase: auth.supabase, userId: auth.user.id }
}

export async function GET() {
  const auth = await getAuthenticatedClient()
  if (auth.error) return auth.error
  const { supabase, user } = auth

  const { data, error } = await supabase
    .from("llm_analyses")
    .select("id, ticker, company_name, broker, analysis_date, provider, model, recommendation, confidence, horizon, thesis, risks, prompt, raw_output, created_at, updated_at")
    .eq("user_id", user.id)
    .order("analysis_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(100) as unknown as { data: LlmAnalysisRow[] | null; error: Error | null }

  if (error) {
    return NextResponse.json({ message: "Failed to load LLM analyses." }, { status: 500 })
  }

  return NextResponse.json({ analyses: (data ?? []).map(mapAnalysisRow) })
}

export async function POST(request: Request) {
  const insertClient = await getAnalysisInsertClient(request)
  if (insertClient.error) return insertClient.error
  const { supabase, userId } = insertClient

  const body = await request.json().catch(() => null) as LlmAnalysisRequest | null
  const ticker = body?.ticker?.trim().toUpperCase()
  const model = body?.model?.trim()

  if (!ticker || !model) {
    return NextResponse.json({ message: "ticker and model are required." }, { status: 400 })
  }

  const confidence = body?.confidence === undefined || body.confidence === null
    ? null
    : Number(body.confidence)

  if (confidence !== null && !Number.isFinite(confidence)) {
    return NextResponse.json({ message: "confidence must be a number when provided." }, { status: 400 })
  }

  const now = new Date().toISOString()
  const { data, error } = await (supabase.from("llm_analyses") as unknown as {
    insert(values: unknown): {
      select(columns: string): {
        single(): PromiseLike<{ data: LlmAnalysisRow | null; error: Error | null }>
      }
    }
  }).insert({
      user_id: userId,
      ticker,
      company_name: body?.companyName?.trim() ?? "",
      broker: body?.broker?.trim() || null,
      analysis_date: body?.analysisDate ?? new Date().toISOString().slice(0, 10),
      provider: body?.provider?.trim() || "ollama",
      model,
      recommendation: body?.recommendation?.trim() || "unknown",
      confidence,
      horizon: body?.horizon?.trim() || null,
      thesis: body?.thesis?.trim() || null,
      risks: body?.risks?.trim() || null,
      prompt: body?.prompt?.trim() || null,
      raw_output: toSerializableJson(body?.rawOutput),
      updated_at: now,
    })
    .select("id, ticker, company_name, broker, analysis_date, provider, model, recommendation, confidence, horizon, thesis, risks, prompt, raw_output, created_at, updated_at")
    .single()

  if (error || !data) {
    return NextResponse.json({ message: "Failed to save LLM analysis." }, { status: 500 })
  }

  return NextResponse.json({ analysis: mapAnalysisRow(data) })
}
