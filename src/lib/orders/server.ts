import { NextResponse } from "next/server"
import { getBrokerProvider } from "@/lib/integrations/factory"
import type { BrokerProvider } from "@/lib/integrations/provider"
import { createClient } from "@/utils/supabase/server"
import type { Database, Json } from "@/types/supabase"
import type { BrokerApiCredentials } from "@/types/integrations"
import type { OrderBroker, OrderRequestRow, TradeOrderRequest } from "@/types/orders"

type ProfileRow = {
  t212_api_key: string | null
  t212_api_secret: string | null
  etoro_api_key: string | null
  etoro_api_secret: string | null
}

type OrderDbRow = Database["public"]["Tables"]["order_requests"]["Row"]
type OrderDbInsert = Database["public"]["Tables"]["order_requests"]["Insert"]
type OrderDbUpdate = Database["public"]["Tables"]["order_requests"]["Update"]
type DbError = { message: string }
type DbResult<T> = { data: T | null; error: DbError | null }
type OrderProvider = BrokerProvider & Required<Pick<BrokerProvider, "getOrderCapabilities" | "previewOrder" | "placeOrder">>

type OrderRequestBuilder = {
  select(columns: string): OrderRequestBuilder
  eq(column: string, value: string): OrderRequestBuilder
  order(column: string, options: { ascending: boolean }): OrderRequestBuilder
  limit(count: number): Promise<DbResult<OrderDbRow[]>>
  maybeSingle(): Promise<DbResult<OrderDbRow>>
  single(): Promise<DbResult<OrderDbRow>>
  insert(payload: OrderDbInsert): OrderRequestBuilder
  update(payload: OrderDbUpdate): OrderRequestBuilder
}

function orderRequestsTable(supabase: unknown) {
  return (supabase as { from(table: "order_requests"): OrderRequestBuilder }).from("order_requests")
}

export function toSerializableJson(value: unknown): Json {
  if (value === undefined) return null
  return JSON.parse(JSON.stringify(value)) as Json
}

export function mapOrderRow(row: OrderDbRow): OrderRequestRow {
  return {
    id: row.id,
    userId: row.user_id,
    broker: row.broker,
    instrumentId: row.instrument_id,
    ticker: row.ticker,
    companyName: row.company_name,
    side: row.side,
    orderType: row.order_type,
    inputMode: row.input_mode,
    quantity: row.quantity,
    value: row.value,
    limitPrice: row.limit_price,
    stopPrice: row.stop_price,
    stopLossPrice: row.stop_loss_price,
    takeProfitPrice: row.take_profit_price,
    timeValidity: row.time_validity,
    leverage: row.leverage,
    status: row.status,
    idempotencyKey: row.idempotency_key,
    brokerOrderId: row.broker_order_id,
    rawRequest: row.raw_request,
    rawResponse: row.raw_response,
    errorMessage: row.error_message,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    submittedAt: row.submitted_at,
  }
}

export async function getAuthenticatedOrderContext() {
  const supabase = await createClient()
  if (!supabase) {
    return { error: NextResponse.json({ message: "Supabase not configured." }, { status: 503 }) }
  }

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { error: NextResponse.json({ message: "Unauthorized." }, { status: 401 }) }
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("t212_api_key, t212_api_secret, etoro_api_key, etoro_api_secret")
    .eq("id", user.id)
    .single() as unknown as { data: ProfileRow | null }

  return { supabase, user, profile }
}

export function getBrokerCredentials(profile: ProfileRow | null, broker: OrderBroker): BrokerApiCredentials {
  if (broker === "t212") {
    return { apiKey: profile?.t212_api_key ?? "", apiSecret: profile?.t212_api_secret ?? "" }
  }

  return { apiKey: profile?.etoro_api_key ?? "", apiSecret: profile?.etoro_api_secret ?? "" }
}

export function getOrderProviderOrResponse(broker: OrderBroker) {
  const provider = getBrokerProvider(broker)
  if (!provider) {
    return { error: NextResponse.json({ message: "Unknown broker." }, { status: 400 }) }
  }
  if (!provider.getOrderCapabilities || !provider.previewOrder || !provider.placeOrder) {
    return { error: NextResponse.json({ message: "Broker does not support order placement." }, { status: 400 }) }
  }

  return { provider: provider as OrderProvider }
}

export function parseOrderRequest(value: unknown): TradeOrderRequest {
  const body = (typeof value === "object" && value !== null ? value : {}) as Record<string, unknown>
  return {
    broker: body.broker === "etoro" ? "etoro" : "t212",
    instrumentId: String(body.instrumentId ?? "").trim(),
    ticker: String(body.ticker ?? "").trim().toUpperCase(),
    companyName: body.companyName ? String(body.companyName) : undefined,
    side: body.side === "sell" ? "sell" : "buy",
    orderType: ["market", "limit", "stop", "stop_limit"].includes(String(body.orderType)) ? body.orderType as TradeOrderRequest["orderType"] : "market",
    inputMode: body.inputMode === "value" ? "value" : "quantity",
    quantity: body.quantity === undefined || body.quantity === null || body.quantity === "" ? undefined : Number(body.quantity),
    value: body.value === undefined || body.value === null || body.value === "" ? undefined : Number(body.value),
    limitPrice: body.limitPrice === undefined || body.limitPrice === null || body.limitPrice === "" ? undefined : Number(body.limitPrice),
    stopPrice: body.stopPrice === undefined || body.stopPrice === null || body.stopPrice === "" ? undefined : Number(body.stopPrice),
    stopLossPrice: body.stopLossPrice === undefined || body.stopLossPrice === null || body.stopLossPrice === "" ? undefined : Number(body.stopLossPrice),
    takeProfitPrice: body.takeProfitPrice === undefined || body.takeProfitPrice === null || body.takeProfitPrice === "" ? undefined : Number(body.takeProfitPrice),
    timeValidity: body.timeValidity === "GOOD_TILL_CANCEL" ? "GOOD_TILL_CANCEL" : body.timeValidity === "DAY" ? "DAY" : undefined,
    leverage: body.leverage ? Number(body.leverage) : 1,
    idempotencyKey: String(body.idempotencyKey || crypto.randomUUID()),
    confirmationText: body.confirmationText ? String(body.confirmationText) : undefined,
  }
}

export async function listOrderRequests(supabase: unknown, userId: string) {
  return await orderRequestsTable(supabase)
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(50)
}

export async function findOrderRequestByIdempotency(supabase: unknown, userId: string, broker: OrderBroker, idempotencyKey: string) {
  return await orderRequestsTable(supabase)
    .select("*")
    .eq("user_id", userId)
    .eq("broker", broker)
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle()
}

export async function insertOrderRequest(supabase: unknown, payload: OrderDbInsert) {
  return await orderRequestsTable(supabase)
    .insert(payload)
    .select("*")
    .single()
}

export async function updateOrderRequest(supabase: unknown, id: string, payload: OrderDbUpdate) {
  return await orderRequestsTable(supabase)
    .update(payload)
    .eq("id", id)
    .select("*")
    .single()
}

export async function updateUserOrderRequest(supabase: unknown, id: string, userId: string, payload: OrderDbUpdate) {
  return await orderRequestsTable(supabase)
    .update(payload)
    .eq("id", id)
    .eq("user_id", userId)
    .select("*")
    .single()
}
