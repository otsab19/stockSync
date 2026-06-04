import { NextResponse } from "next/server"
import { getAuthenticatedOrderContext, listOrderRequests, mapOrderRow } from "@/lib/orders/server"

export async function GET() {
  const context = await getAuthenticatedOrderContext()
  if ("error" in context) return context.error

  const { data, error } = await listOrderRequests(context.supabase, context.user.id)

  if (error) {
    return NextResponse.json({ message: error.message }, { status: 500 })
  }

  return NextResponse.json({ orders: (data ?? []).map(mapOrderRow) })
}
