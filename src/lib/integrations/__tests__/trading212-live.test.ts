import { describe, it, expect } from "vitest"
import {
  mapTrading212HistoryItemsToActivity,
  mapTrading212PortfolioResponse,
} from "@/lib/integrations/trading212-live"

describe("Trading 212 live mapper", () => {
  it("maps a GBP position correctly", () => {
    const payload = [
      {
        ticker: "VUSA",
        quantity: 10,
        averagePricePaid: 80,
        currentPrice: 85,
        currencyCode: "GBP",
        name: "Vanguard S&P 500 UCITS ETF",
      },
    ]

    const positions = mapTrading212PortfolioResponse(payload)
    expect(positions).toHaveLength(1)
    expect(positions[0].ticker).toBe("VUSA")
    expect(positions[0].nativeCurrency).toBe("GBP")
    expect(positions[0].fxRateToGbp).toBe(1)
    expect(positions[0].normalizedTotalValueGbp).toBe(850) // 10 * 85
  })

  it("maps a USD position with FX conversion", () => {
    const payload = [
      {
        ticker: "AAPL",
        quantity: 5,
        averagePricePaid: 150,
        currentPrice: 160,
        currencyCode: "USD",
        name: "Apple Inc.",
      },
    ]

    const positions = mapTrading212PortfolioResponse(payload)
    expect(positions).toHaveLength(1)
    expect(positions[0].ticker).toBe("AAPL")
    expect(positions[0].nativeCurrency).toBe("USD")
    expect(positions[0].fxRateToGbp).toBe(0.79)
    // nativeTotalValue = 5 * 160 = 800
    // normalizedTotalValueGbp = 800 * 0.79 = 632
    expect(positions[0].normalizedTotalValueGbp).toBe(632)
  })

  it("uses instrument currency and wallet value to match GBP account valuation", () => {
    const payload = [
      {
        ticker: "AAPL_US_EQ",
        quantity: 5,
        averagePricePaid: 150,
        currentPrice: 160,
        currencyCode: "USD",
        walletImpact: {
          currency: "GBP",
          currentValue: 620,
          result: 38.75,
        },
        name: "Apple Inc.",
      },
    ]

    const positions = mapTrading212PortfolioResponse(payload)

    expect(positions).toHaveLength(1)
    expect(positions[0].ticker).toBe("AAPL")
    expect(positions[0].nativeCurrency).toBe("USD")
    expect(positions[0].fxRateToGbp).toBeCloseTo(0.775, 3)
    expect(positions[0].normalizedTotalValueGbp).toBeCloseTo(620, 2)
    expect(positions[0].totalPL).toBeCloseTo(38.75, 2)
  })

  it("normalizes pence ticker suffixes before generic exchange suffixes", () => {
    const payload = [
      {
        ticker: "VODp_EQ",
        quantity: 100,
        averagePricePaid: 0.7,
        currentPrice: 0.75,
        currencyCode: "GBP",
        name: "Vodafone",
      },
    ]

    const positions = mapTrading212PortfolioResponse(payload)

    expect(positions[0].ticker).toBe("VOD")
  })

  it("keeps positions that only expose wallet currency", () => {
    const payload = [
      {
        ticker: "ALHPI",
        quantity: 8,
        averagePricePaid: 12,
        currentPrice: 9.39,
        walletImpact: {
          currency: "GBP",
          result: -20.88,
        },
        name: "Amundi Physical Gold",
      },
    ]

    const positions = mapTrading212PortfolioResponse(payload)

    expect(positions).toHaveLength(1)
    expect(positions[0].ticker).toBe("ALHPI")
    expect(positions[0].nativeCurrency).toBe("GBP")
    expect(positions[0].totalPL).toBeCloseTo(-20.88, 2)
  })

  it("throws when positions have zero shares (safeguard)", () => {
    const payload = [
      {
        ticker: "MSFT",
        quantity: 0,
        averagePricePaid: 300,
        currentPrice: 310,
        currencyCode: "USD",
        name: "Microsoft",
      },
    ]

    expect(() => mapTrading212PortfolioResponse(payload)).toThrow()
  })

  it("maps broker-reported realised p/l from fill wallet impact in GBP", () => {
    const activity = mapTrading212HistoryItemsToActivity([
      {
        order: {
          id: 1001,
          side: "SELL",
          instrument: { ticker: "AAPL_US_EQ", currency: "USD", name: "Apple Inc." },
        },
        fill: {
          id: 9001,
          filledAt: "2026-06-01T12:00:00Z",
          quantity: 5,
          price: 160,
          walletImpact: {
            currency: "GBP",
            netValue: 620,
            realisedProfitLoss: 42.5,
            fxRate: 1.29,
          },
        },
      },
    ])

    expect(activity).toHaveLength(1)
    expect(activity[0]?.id).toBe("t212:fill:9001")
    expect(activity[0]?.type).toBe("sell")
    expect(activity[0]?.realisedProfitGbp).toBe(42.5)
    expect(activity[0]?.grossAmountGbp).toBe(620)
  })

  it("keeps separate activity rows for multiple fills on the same order", () => {
    const activity = mapTrading212HistoryItemsToActivity([
      {
        order: { id: 2002, side: "SELL", instrument: { ticker: "NVDA_US_EQ", currency: "USD", name: "NVIDIA" } },
        fill: {
          id: 9101,
          filledAt: "2026-06-02T10:00:00Z",
          quantity: 2,
          price: 110,
          walletImpact: { currency: "GBP", netValue: 170, realisedProfitLoss: 10 },
        },
      },
      {
        order: { id: 2002, side: "SELL", instrument: { ticker: "NVDA_US_EQ", currency: "USD", name: "NVIDIA" } },
        fill: {
          id: 9102,
          filledAt: "2026-06-02T10:00:01Z",
          quantity: 3,
          price: 110,
          walletImpact: { currency: "GBP", netValue: 255, realisedProfitLoss: 15 },
        },
      },
    ])

    expect(activity).toHaveLength(2)
    expect(activity.map((event) => event.id)).toEqual(["t212:fill:9101", "t212:fill:9102"])
    expect(activity.reduce((sum, event) => sum + (event.realisedProfitGbp ?? 0), 0)).toBe(25)
  })

  it("does not attach realised p/l to buy legs", () => {
    const activity = mapTrading212HistoryItemsToActivity([
      {
        order: {
          id: 3003,
          side: "BUY",
          instrument: { ticker: "AAPL_US_EQ", currency: "USD", name: "Apple Inc." },
        },
        fill: {
          id: 9201,
          filledAt: "2026-06-01T09:00:00Z",
          quantity: 5,
          price: 150,
          walletImpact: {
            currency: "GBP",
            netValue: -590,
            realisedProfitLoss: 0,
          },
        },
      },
    ])

    expect(activity[0]?.type).toBe("buy")
    expect(activity[0]?.realisedProfitGbp).toBeUndefined()
  })
})

