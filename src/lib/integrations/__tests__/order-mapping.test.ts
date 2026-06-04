import { describe, expect, it } from "vitest"
import { buildEtoroOrderPayload } from "@/lib/integrations/etoro-live"
import { buildTrading212OrderPayload } from "@/lib/integrations/trading212-live"
import type { TradeOrderRequest } from "@/types/orders"

describe("broker order mapping", () => {
  it("maps Trading 212 sells to negative quantity and limit endpoint", () => {
    const order: TradeOrderRequest = {
      broker: "t212",
      instrumentId: "AAPL_US_EQ",
      ticker: "AAPL",
      side: "sell",
      orderType: "limit",
      inputMode: "quantity",
      quantity: 2,
      limitPrice: 220,
      idempotencyKey: "key",
    }

    expect(buildTrading212OrderPayload(order)).toEqual({
      endpoint: "/equity/orders/limit",
      payload: {
        ticker: "AAPL_US_EQ",
        quantity: -2,
        limitPrice: 220,
      },
    })
  })

  it("maps eToro value orders with stop loss and take profit", () => {
    const order: TradeOrderRequest = {
      broker: "etoro",
      instrumentId: "1001",
      ticker: "AAPL",
      side: "buy",
      orderType: "limit",
      inputMode: "value",
      value: 100,
      limitPrice: 200,
      stopLossPrice: 180,
      takeProfitPrice: 230,
      leverage: 1,
      idempotencyKey: "key",
    }

    expect(buildEtoroOrderPayload(order)).toEqual({
      InstrumentID: 1001,
      IsBuy: true,
      Leverage: 1,
      Amount: 100,
      Rate: 200,
      StopLossRate: 180,
      IsNoStopLoss: false,
      TakeProfitRate: 230,
      IsNoTakeProfit: false,
    })
  })
})
