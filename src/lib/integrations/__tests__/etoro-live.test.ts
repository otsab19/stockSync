import { afterEach, describe, it, expect, vi } from "vitest"
import { fetchEtoroActivityFromApi, mapEtoroPortfolioResponse } from "@/lib/integrations/etoro-live"

afterEach(() => {
  vi.unstubAllGlobals()
})

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

  it("returns an empty portfolio when eToro has no open positions", () => {
    const payload = {
      clientPortfolio: {
        positions: [],
      },
    }

    expect(mapEtoroPortfolioResponse(payload)).toEqual([])
  })

  it("returns an empty portfolio for short-only position rows", () => {
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

    expect(mapEtoroPortfolioResponse(payload)).toEqual([])
  })

  it("uses eToro history symbol fields when metadata enrichment is unavailable", async () => {
    const fetchMock = vi.fn(async (url: string | URL | Request) => {
      const requestUrl = String(url)

      if (requestUrl.includes("/trading/info/trade/history")) {
        return Response.json([
          {
            instrumentID: 137,
            symbolFull: "NVDA",
            instrumentDisplayName: "NVIDIA Corporation",
            isBuy: true,
            openTimestamp: "2026-06-01T09:00:00Z",
            closeTimestamp: "2026-06-01T15:00:00Z",
            openRate: 100,
            closeRate: 110,
            investment: 1000,
            units: 10,
          },
        ])
      }

      if (requestUrl.includes("/market-data/instruments?")) {
        return new Response("metadata unavailable", { status: 500 })
      }

      if (requestUrl.includes("/market-data/instruments/rates")) {
        return Response.json({ rates: [] })
      }

      return new Response("unexpected request", { status: 404 })
    })

    vi.stubGlobal("fetch", fetchMock)

    const activity = await fetchEtoroActivityFromApi({ apiKey: "api-key", apiSecret: "user-key" })

    expect(activity).toHaveLength(2)
    expect(activity.map((event) => event.ticker)).toEqual(["NVDA", "NVDA"])
    expect(activity.map((event) => event.companyName)).toEqual(["NVIDIA Corporation", "NVIDIA Corporation"])
  })

  it("treats LSE history prices as pence when metadata is unavailable", async () => {
    const fetchMock = vi.fn(async (url: string | URL | Request) => {
      const requestUrl = String(url)

      if (requestUrl.includes("/trading/info/trade/history")) {
        return Response.json([
          {
            instrumentID: 2072,
            symbolFull: "RR.L",
            instrumentDisplayName: "Rolls-Royce Holdings",
            isBuy: true,
            openTimestamp: "2026-06-01T09:00:00Z",
            closeTimestamp: "2026-06-01T15:00:00Z",
            openRate: 1000,
            closeRate: 1324,
            units: 1,
            investment: 1000,
          },
        ])
      }

      if (requestUrl.includes("/market-data/instruments?")) {
        return new Response("metadata unavailable", { status: 500 })
      }

      if (requestUrl.includes("/market-data/instruments/rates")) {
        return Response.json({ rates: [] })
      }

      return new Response("unexpected request", { status: 404 })
    })

    vi.stubGlobal("fetch", fetchMock)

    const activity = await fetchEtoroActivityFromApi({ apiKey: "api-key", apiSecret: "user-key" })
    const sell = activity.find((event) => event.type === "sell")

    expect(sell?.ticker).toBe("RR")
    expect(sell?.nativeCurrency).toBe("GBP")
    expect(sell?.price).toBe(13.24)
    expect(sell?.grossAmountGbp).toBe(13.24)
  })

  it("infers pence pricing for UK history rows without an exchange suffix", async () => {
    const fetchMock = vi.fn(async (url: string | URL | Request) => {
      const requestUrl = String(url)

      if (requestUrl.includes("/trading/info/trade/history")) {
        return Response.json([
          {
            instrumentID: 9453,
            instrumentDisplayName: "Rolls-Royce Holdings",
            isBuy: true,
            openTimestamp: "2026-06-01T09:00:00Z",
            closeTimestamp: "2026-06-01T15:00:00Z",
            openRate: 1000,
            closeRate: 1324,
            units: 1,
            investment: 13,
          },
        ])
      }

      if (requestUrl.includes("/market-data/instruments?")) {
        return new Response("metadata unavailable", { status: 500 })
      }

      if (requestUrl.includes("/market-data/instruments/rates")) {
        return Response.json({ rates: [] })
      }

      return new Response("unexpected request", { status: 404 })
    })

    vi.stubGlobal("fetch", fetchMock)

    const activity = await fetchEtoroActivityFromApi({ apiKey: "api-key", apiSecret: "user-key" })
    const sell = activity.find((event) => event.type === "sell")

    expect(sell?.price).toBe(13.24)
    expect(sell?.grossAmountGbp).toBe(13.24)
  })

  it("uses fresh eToro request IDs across history and metadata calls", async () => {
    const requestIds: string[] = []
    const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const requestUrl = String(url)
      const headers = init?.headers as Record<string, string> | undefined
      if (headers?.["x-request-id"]) {
        requestIds.push(headers["x-request-id"])
      }

      if (requestUrl.includes("/trading/info/trade/history")) {
        return Response.json([
          {
            instrumentID: 2072,
            isBuy: true,
            openTimestamp: "2026-06-01T09:00:00Z",
            closeTimestamp: "2026-06-01T15:00:00Z",
            openRate: 1000,
            closeRate: 1324,
            units: 1,
            investment: 1000,
          },
        ])
      }

      if (requestUrl.includes("/market-data/instruments?")) {
        return Response.json({
          instrumentDisplayDatas: [{
            instrumentID: 2072,
            instrumentDisplayName: "Rolls-Royce Holdings",
            symbolFull: "RR.L",
            priceSource: "LSE",
          }],
        })
      }

      if (requestUrl.includes("/market-data/instruments/rates")) {
        return Response.json({ rates: [] })
      }

      return new Response("unexpected request", { status: 404 })
    })

    vi.stubGlobal("fetch", fetchMock)

    const activity = await fetchEtoroActivityFromApi({ apiKey: "api-key", apiSecret: "user-key" })

    expect(activity.find((event) => event.type === "sell")?.ticker).toBe("RR")
    expect(new Set(requestIds).size).toBe(requestIds.length)
  })

  it("requests eToro metadata with comma-separated instrument IDs", async () => {
    const requestUrls: string[] = []
    const fetchMock = vi.fn(async (url: string | URL | Request) => {
      const requestUrl = String(url)
      requestUrls.push(requestUrl)

      if (requestUrl.includes("/trading/info/trade/history")) {
        return Response.json([
          {
            instrumentID: 1137,
            isBuy: true,
            openTimestamp: "2026-05-29T16:57:00Z",
            closeTimestamp: "2026-06-01T14:50:00Z",
            openRate: 215.27,
            closeRate: 220.29,
            units: 31.123705,
            investment: 5293,
          },
          {
            instrumentID: 2072,
            isBuy: true,
            openTimestamp: "2026-05-28T10:08:00Z",
            closeTimestamp: "2026-05-28T15:19:00Z",
            openRate: 1305,
            closeRate: 1324.08,
            units: 377.310598,
            investment: 388988.36,
          },
        ])
      }

      if (requestUrl.includes("/market-data/instruments?")) {
        return Response.json({
          instrumentDisplayDatas: [
            { instrumentID: 1137, instrumentDisplayName: "NVIDIA Corporation", symbolFull: "NVDA", priceSource: "NASDAQ" },
            { instrumentID: 2072, instrumentDisplayName: "Rolls-Royce Holdings", symbolFull: "RR.L", priceSource: "LSE" },
          ],
        })
      }

      if (requestUrl.includes("/market-data/instruments/rates")) {
        return Response.json({ rates: [] })
      }

      return new Response("unexpected request", { status: 404 })
    })

    vi.stubGlobal("fetch", fetchMock)

    const activity = await fetchEtoroActivityFromApi({ apiKey: "api-key", apiSecret: "user-key" })
    const metadataUrl = requestUrls.find((url) => url.includes("/market-data/instruments?"))

    expect(metadataUrl).toContain("instrumentIds=1137,2072")
    expect(metadataUrl).not.toContain("1137%2C2072")
    expect(activity.filter((event) => event.type === "sell").map((event) => event.ticker)).toEqual(["NVDA", "RR"])
    expect(activity.find((event) => event.ticker === "RR" && event.type === "sell")?.price).toBe(13.2408)
  })
})

