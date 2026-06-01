import { describe, it, expect } from "vitest"
import { mapEtoroPortfolioResponse } from "@/lib/integrations/etoro-live"

describe("eToro live mapper", () => {
  it("maps a USD position with correct FX", () => {
    const payload = {
      clientPortfolio: {
        positions: [
          {
            instrumentID: 1001,
            IsBuy: true,
            units: 3,
            Amount: 525,
            averageOpen: 175,
            currentRate: 182.5,
            currency: "USD",
          },
        ],
      },
    }

    const positions = mapEtoroPortfolioResponse(payload)
    expect(positions).toHaveLength(1)
    expect(positions[0].nativeCurrency).toBe("USD")
    expect(positions[0].fxRateToGbp).toBe(0.79)
    // livePrice=182.5, shares=3, nativeTotal=547.5, gbp=547.5*0.79=432.525
    expect(positions[0].normalizedTotalValueGbp).toBeCloseTo(432.525, 2)
  })

  it("handles GBX (pence) positions — divides price by 100, sets GBP", () => {
    const payload = {
      clientPortfolio: {
        positions: [
          {
            instrumentID: 2002,
            IsBuy: true,
            units: 100,
            Amount: 500,
            averageOpen: 500, // 500 pence = £5.00
            currentRate: 520,  // 520 pence = £5.20
            currency: "GBp",
          },
        ],
      },
    }

    const positions = mapEtoroPortfolioResponse(payload)
    expect(positions).toHaveLength(1)
    expect(positions[0].nativeCurrency).toBe("GBP")
    // prices should be divided by 100
    expect(positions[0].avgPrice).toBe(5)
    expect(positions[0].livePrice).toBe(5.2)
    expect(positions[0].fxRateToGbp).toBe(1)
    // nativeTotal = 100 * 5.2 = 520, gbp = 520
    expect(positions[0].normalizedTotalValueGbp).toBe(520)
  })

  it("does not treat invested Amount as share count", () => {
    const payload = {
      clientPortfolio: {
        positions: [
          {
            instrumentID: 1001,
            IsBuy: true,
            Amount: 525,
            averageOpen: 175,
            currentRate: 182.5,
            currency: "USD",
          },
        ],
      },
    }

    const positions = mapEtoroPortfolioResponse(payload)

    expect(positions).toHaveLength(1)
    expect(positions[0].shares).toBe(3)
    expect(positions[0].normalizedTotalValueGbp).toBeCloseTo(432.525, 2)
  })

  it("normalizes LSE suffixes and known ticker aliases", () => {
    const payload = {
      clientPortfolio: {
        positions: [
          {
            ticker: "RRl",
            IsBuy: true,
            units: 10,
            averageOpen: 150,
            currentRate: 155,
            currency: "GBp",
          },
          {
            ticker: "GIG",
            IsBuy: true,
            units: 1,
            averageOpen: 2,
            currentRate: 3,
            currency: "USD",
          },
        ],
      },
    }

    const positions = mapEtoroPortfolioResponse(payload)

    expect(positions.map((position) => position.ticker)).toEqual(["RR", "BBAI"])
  })

  it("throws for short positions (isBuy=false) when no long positions exist", () => {
    const payload = {
      clientPortfolio: {
        positions: [
          {
            instrumentID: 3003,
            IsBuy: false,
            units: 10,
            Amount: 1000,
            averageOpen: 100,
            currentRate: 95,
            currency: "USD",
          },
        ],
      },
    }

    expect(() => mapEtoroPortfolioResponse(payload)).toThrow()
  })
})

