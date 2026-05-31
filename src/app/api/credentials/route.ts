import { NextResponse } from "next/server"
import { createClient } from "@/utils/supabase/server"
import { getConfiguredBackend } from "@/lib/backend/config"

export async function GET() {
  if (getConfiguredBackend() !== "supabase") {
    return NextResponse.json({ status: "browser_mode", credentials: {} })
  }

  const supabase = await createClient()
  if (!supabase) {
    return NextResponse.json({ status: "no_supabase", credentials: {} })
  }

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ status: "unauthorized", credentials: {} })
  }

  const { data } = await supabase
    .from("profiles")
    .select("t212_api_key, t212_api_secret, etoro_api_key, etoro_api_secret")
    .eq("id", user.id)
    .single()

  const profile = data as unknown as {
    t212_api_key: string | null
    t212_api_secret: string | null
    etoro_api_key: string | null
    etoro_api_secret: string | null
  } | null

  return NextResponse.json({
    status: "ok",
    credentials: {
      t212: { hasKey: Boolean(profile?.t212_api_key), hasSecret: Boolean(profile?.t212_api_secret) },
      etoro: { hasKey: Boolean(profile?.etoro_api_key), hasSecret: Boolean(profile?.etoro_api_secret) },
    },
  })
}

export async function POST(request: Request) {
  if (getConfiguredBackend() !== "supabase") {
    return NextResponse.json({ message: "Not in supabase mode." }, { status: 200 })
  }

  const supabase = await createClient()
  if (!supabase) {
    return NextResponse.json({ message: "Supabase not configured." }, { status: 503 })
  }

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ message: "Unauthorized." }, { status: 401 })
  }

  const body = await request.json()
  const { broker, apiKey, apiSecret } = body as { broker?: string; apiKey?: string; apiSecret?: string }

  if (!broker || !apiKey) {
    return NextResponse.json({ message: "broker and apiKey required." }, { status: 400 })
  }

  const updateData: Record<string, string | null> = {}
  if (broker === "t212") {
    updateData.t212_api_key = apiKey
    updateData.t212_api_secret = apiSecret || null
  } else if (broker === "etoro") {
    updateData.etoro_api_key = apiKey
    updateData.etoro_api_secret = apiSecret || null
  } else {
    return NextResponse.json({ message: "Unknown broker." }, { status: 400 })
  }

  const { error } = await (supabase.from("profiles") as any).update(updateData).eq("id", user.id)

  if (error) {
    return NextResponse.json({ message: "Failed to save credentials." }, { status: 500 })
  }

  return NextResponse.json({ message: "Credentials saved." })
}

export async function DELETE(request: Request) {
  if (getConfiguredBackend() !== "supabase") {
    return NextResponse.json({ message: "Not in supabase mode." }, { status: 200 })
  }

  const supabase = await createClient()
  if (!supabase) {
    return NextResponse.json({ message: "Supabase not configured." }, { status: 503 })
  }

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ message: "Unauthorized." }, { status: 401 })
  }

  const body = await request.json()
  const { broker } = body as { broker?: string }

  const updateData: Record<string, null> = {}
  if (broker === "t212") {
    updateData.t212_api_key = null
    updateData.t212_api_secret = null
  } else if (broker === "etoro") {
    updateData.etoro_api_key = null
    updateData.etoro_api_secret = null
  } else {
    return NextResponse.json({ message: "Unknown broker." }, { status: 400 })
  }

  await (supabase.from("profiles") as any).update(updateData).eq("id", user.id)

  return NextResponse.json({ message: "Credentials removed." })
}

