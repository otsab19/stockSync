import { NextResponse } from "next/server"
import { getBrokerProvider } from "@/lib/integrations/factory"
import { getAuthenticatedOrderContext, getBrokerCredentials } from "@/lib/orders/server"
import type { ClosePositionRequest } from "@/types/pending-orders"

function assertLiveTradingEnabled() {
  if (process.env.ENABLE_LIVE_TRADING !== "true") {
    return NextResponse.json({ message: "Live trading is disabled on this deployment." }, { status: 403 })
  }

  return null
}

export async function POST(request: Request) {
  const disabled = assertLiveTradingEnabled()
  if (disabled) return disabled

  const context = await getAuthenticatedOrderContext()
  if ("error" in context) return context.error

  const body = await request.json() as ClosePositionRequest
  if (!body.broker || !body.positionId || !body.instrumentId || !body.ticker) {
    return NextResponse.json({ message: "broker, positionId, instrumentId, and ticker are required." }, { status: 400 })
  }

  const requiredConfirmation = `CLOSE ${body.ticker.trim().toUpperCase()}`
  if (body.confirmationText?.trim().toUpperCase() !== requiredConfirmation) {
    return NextResponse.json({ message: `Type "${requiredConfirmation}" to confirm closing this position.` }, { status: 400 })
  }

  const provider = getBrokerProvider(body.broker)
  if (!provider?.closePosition) {
    return NextResponse.json({
      message: body.broker === "t212"
        ? "Use the Trade page to place a sell order for Trading 212 positions."
        : "This broker does not support closing positions from StockSync yet.",
    }, { status: 400 })
  }

  const credentials = getBrokerCredentials(context.profile ?? null, body.broker)
  const result = await provider.closePosition(body, credentials)

  return NextResponse.json({ result })
}
