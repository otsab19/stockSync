import { describe, it, expect } from "vitest"
import { mapTrading212PortfolioResponse } from "@/lib/integrations/trading212-live"

// We need to test the activity mapper indirectly since it's not exported individually.
// But mapTrading212PortfolioResponse IS exported and we can test it.
// For activity, we'll test via fetchTrading212ActivityFromApi by mocking fetch,
// but since the mapper function `mapTrading212OrderRowToActivity` isn't exported,
// let's test the exported functions and verify FX logic.

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
})

