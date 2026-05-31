import { NextResponse } from "next/server"
import { createClient } from "@/utils/supabase/server"
import { getConfiguredBackend } from "@/lib/backend/config"

export async function POST(request: Request) {
  if (getConfiguredBackend() === "browser") {
    return NextResponse.json(
      { message: "Push subscriptions require Supabase backend." },
      { status: 501 }
    )
  }

  const supabase = await createClient()
  if (!supabase) {
    return NextResponse.json({ message: "Supabase not configured." }, { status: 503 })
  }

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 })
  }

  const body = await request.json()
  const { endpoint, p256dh, auth } = body as {
    endpoint?: string
    p256dh?: string
    auth?: string
  }

  if (!endpoint || !p256dh || !auth) {
    return NextResponse.json({ message: "Missing endpoint, p256dh, or auth." }, { status: 400 })
  }

  const { error } = await (supabase.from("push_subscriptions") as any).upsert(
    { user_id: user.id, endpoint, p256dh, auth },
    { onConflict: "endpoint" }
  )

  if (error) {
    return NextResponse.json({ message: "Failed to save subscription." }, { status: 500 })
  }

  return NextResponse.json({ message: "Subscribed successfully." })
}

export async function DELETE(request: Request) {
  if (getConfiguredBackend() === "browser") {
    return NextResponse.json({ message: "Not supported." }, { status: 501 })
  }

  const supabase = await createClient()
  if (!supabase) {
    return NextResponse.json({ message: "Supabase not configured." }, { status: 503 })
  }

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 })
  }

  const body = await request.json()
  const { endpoint } = body as { endpoint?: string }

  if (!endpoint) {
    return NextResponse.json({ message: "Missing endpoint." }, { status: 400 })
  }

  await supabase
    .from("push_subscriptions")
    .delete()
    .eq("user_id", user.id)
    .eq("endpoint", endpoint)

  return NextResponse.json({ message: "Unsubscribed." })
}

