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

