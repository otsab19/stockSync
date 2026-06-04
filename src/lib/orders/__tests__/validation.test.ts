import { describe, expect, it, vi } from "vitest"
import { assertOrderCanSubmit, getRequiredConfirmation, validateOrderRequest } from "@/lib/orders/validation"
import type { TradeOrderRequest } from "@/types/orders"

const baseOrder: TradeOrderRequest = {
  broker: "t212",
  instrumentId: "AAPL_US_EQ",
  ticker: "AAPL",
  side: "buy",
  orderType: "market",
  inputMode: "quantity",
  quantity: 1,
  idempotencyKey: "order-key",
}

describe("order validation", () => {
  it("builds explicit confirmation phrases", () => {
    expect(getRequiredConfirmation(baseOrder)).toBe("BUY AAPL")
  })

  it("rejects Trading 212 value orders", () => {
    const result = validateOrderRequest({ ...baseOrder, inputMode: "value", value: 50, quantity: undefined })
    expect(result.errors).toContain("Trading 212 order API only supports quantity orders.")
  })

  it("requires limit and stop prices by order type", () => {
    const result = validateOrderRequest({ ...baseOrder, orderType: "stop_limit" })
    expect(result.errors).toContain("Limit price is required for limit and stop-limit orders.")
    expect(result.errors).toContain("Stop price is required for stop and stop-limit orders.")
  })

  it("blocks submit when live trading is disabled", () => {
    vi.stubEnv("ENABLE_LIVE_TRADING", "false")
    expect(() => assertOrderCanSubmit({ ...baseOrder, confirmationText: "BUY AAPL" })).toThrow("Live trading is disabled")
    vi.unstubAllEnvs()
  })

  it("blocks submit without exact confirmation", () => {
    vi.stubEnv("ENABLE_LIVE_TRADING", "true")
    expect(() => assertOrderCanSubmit({ ...baseOrder, confirmationText: "BUY TSLA" })).toThrow("Type BUY AAPL")
    vi.unstubAllEnvs()
  })
})
