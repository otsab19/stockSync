import { NextResponse } from "next/server"
import { createClient, createServiceRoleClient } from "@/utils/supabase/server"

type AnalysisTargetStatus = "pending" | "running" | "analyzed" | "paused"

type AnalysisTargetRow = {
  id: string
  ticker: string
  company_name: string
  broker: string
  status: AnalysisTargetStatus
  priority: number
  notes: string | null
  last_analyzed_at: string | null
  created_at: string
  updated_at: string
}

type AnalysisTargetRequest = {
  ticker?: string
  companyName?: string
  broker?: string | null
  notes?: string | null
  priority?: number
  status?: AnalysisTargetStatus
}

function mapTargetRow(row: AnalysisTargetRow) {
  return {
    id: row.id,
    ticker: row.ticker,
    companyName: row.company_name,
    broker: row.broker || null,
    status: row.status,
    priority: row.priority,
    notes: row.notes,
    lastAnalyzedAt: row.last_analyzed_at,
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

  return { supabase, userId: user.id }
}

async function getTargetClient(request: Request) {
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

  return getAuthenticatedClient()
}

function normalizeStatus(value: unknown): AnalysisTargetStatus {
  return value === "running" || value === "analyzed" || value === "paused" ? value : "pending"
}

export async function GET(request: Request) {
  const auth = await getTargetClient(request)
  if (auth.error) return auth.error
  const { supabase, userId } = auth

  const { searchParams } = new URL(request.url)
  const status = searchParams.get("status")
  let query = supabase
    .from("llm_analysis_targets")
    .select("id, ticker, company_name, broker, status, priority, notes, last_analyzed_at, created_at, updated_at")
    .eq("user_id", userId)
    .order("priority", { ascending: false })
    .order("created_at", { ascending: true })
    .limit(200)

  if (status) {
    query = query.eq("status", normalizeStatus(status))
  }

  const { data, error } = await query as unknown as { data: AnalysisTargetRow[] | null; error: Error | null }

  if (error) {
    return NextResponse.json({ message: "Failed to load analysis targets." }, { status: 500 })
  }

  return NextResponse.json({ targets: (data ?? []).map(mapTargetRow) })
}

export async function POST(request: Request) {
  const auth = await getTargetClient(request)
  if (auth.error) return auth.error
  const { supabase, userId } = auth

  const body = await request.json().catch(() => null) as AnalysisTargetRequest | null
  const ticker = body?.ticker?.trim().toUpperCase()

  if (!ticker) {
    return NextResponse.json({ message: "ticker is required." }, { status: 400 })
  }

  const priority = Number(body?.priority ?? 0)
  if (!Number.isFinite(priority)) {
    return NextResponse.json({ message: "priority must be a number." }, { status: 400 })
  }

  const now = new Date().toISOString()
  const broker = body?.broker?.trim() ?? ""
  const { data, error } = await (supabase.from("llm_analysis_targets") as unknown as {
    upsert(values: unknown, options?: unknown): {
      select(columns: string): {
        single(): PromiseLike<{ data: AnalysisTargetRow | null; error: Error | null }>
      }
    }
  }).upsert(
    {
      user_id: userId,
      ticker,
      company_name: body?.companyName?.trim() ?? "",
      broker,
      status: normalizeStatus(body?.status),
      priority,
      notes: body?.notes?.trim() || null,
      updated_at: now,
    },
    { onConflict: "user_id,ticker,broker" }
  )
    .select("id, ticker, company_name, broker, status, priority, notes, last_analyzed_at, created_at, updated_at")
    .single()

  if (error || !data) {
    return NextResponse.json({ message: "Failed to save analysis target." }, { status: 500 })
  }

  return NextResponse.json({ target: mapTargetRow(data) })
}
