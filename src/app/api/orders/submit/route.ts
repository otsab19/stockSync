import { NextResponse } from "next/server"
import { assertOrderCanSubmit } from "@/lib/orders/validation"
import {
  getAuthenticatedOrderContext,
  getBrokerCredentials,
  getOrderProviderOrResponse,
  findOrderRequestByIdempotency,
  insertOrderRequest,
  mapOrderRow,
  parseOrderRequest,
  toSerializableJson,
  updateOrderRequest,
} from "@/lib/orders/server"

export async function POST(request: Request) {
  const context = await getAuthenticatedOrderContext()
  if ("error" in context) return context.error

  const order = parseOrderRequest(await request.json())
  const providerResult = getOrderProviderOrResponse(order.broker)
  if ("error" in providerResult) return providerResult.error

  try {
    assertOrderCanSubmit(order)
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "Invalid order." }, { status: 400 })
  }

  const credentials = getBrokerCredentials(context.profile ?? null, order.broker)
  if (!credentials.apiKey || !credentials.apiSecret) {
    return NextResponse.json({ message: "Broker credentials are missing." }, { status: 400 })
  }

  const { data: existing } = await findOrderRequestByIdempotency(context.supabase, context.user.id, order.broker, order.idempotencyKey)

  if (existing) {
    return NextResponse.json({
      message: "Duplicate submit ignored for this idempotency key.",
      order: mapOrderRow(existing),
      duplicate: true,
    }, { status: 409 })
  }

  const { data: inserted, error: insertError } = await insertOrderRequest(context.supabase, {
      user_id: context.user.id,
      broker: order.broker,
      instrument_id: order.instrumentId,
      ticker: order.ticker,
      company_name: order.companyName ?? order.ticker,
      side: order.side,
      order_type: order.orderType,
      input_mode: order.inputMode,
      quantity: order.quantity ?? null,
      value: order.value ?? null,
      limit_price: order.limitPrice ?? null,
      stop_price: order.stopPrice ?? null,
      stop_loss_price: order.stopLossPrice ?? null,
      take_profit_price: order.takeProfitPrice ?? null,
      time_validity: order.timeValidity ?? null,
      leverage: order.leverage ?? 1,
      status: "submitted",
      idempotency_key: order.idempotencyKey,
      raw_request: toSerializableJson(order),
      submitted_at: new Date().toISOString(),
    })

  if (insertError || !inserted) {
    return NextResponse.json({ message: insertError?.message ?? "Failed to create order audit row." }, { status: 500 })
  }

  try {
    const result = await providerResult.provider.placeOrder(order, credentials)
    const finalStatus = result.status === "rejected" ? "rejected" : result.status === "accepted" ? "accepted" : "submitted"
    const { data: updated, error: updateError } = await updateOrderRequest(context.supabase, inserted.id, {
        status: finalStatus,
        broker_order_id: result.brokerOrderId ?? null,
        raw_response: result.rawResponse,
        error_message: null,
        updated_at: new Date().toISOString(),
      })

    if (updateError || !updated) {
      return NextResponse.json({ message: updateError?.message ?? "Order submitted, but audit update failed.", order: mapOrderRow(inserted) }, { status: 202 })
    }

    return NextResponse.json({ message: "Order submitted.", order: mapOrderRow(updated) })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Broker order submission failed."
    const { data: failed } = await updateOrderRequest(context.supabase, inserted.id, {
        status: "failed",
        error_message: message,
        updated_at: new Date().toISOString(),
      })

    return NextResponse.json({ message, order: failed ? mapOrderRow(failed) : mapOrderRow(inserted) }, { status: 502 })
  }
}
