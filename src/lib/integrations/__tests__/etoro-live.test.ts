import { afterEach, describe, it, expect, vi } from "vitest"
import { extractEtoroAccountSnapshot, fetchEtoroActivityFromApi, fetchEtoroPortfolioFromApi, fetchEtoroSyncDataFromApi, mapEtoroPortfolioResponse } from "@/lib/integrations/etoro-live"

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

  it("adds open eToro portfolio positions to sync activity when they have an open timestamp", async () => {
    const fetchMock = vi.fn(async (url: string | URL | Request) => {
      const requestUrl = String(url)

      if (requestUrl.includes("/trading/info/portfolio")) {
        return Response.json({
          clientPortfolio: {
            positions: [
              {
                positionId: 9001,
                instrumentID: 2072,
                symbolFull: "RR.L",
                instrumentDisplayName: "Rolls-Royce Holdings",
                IsBuy: true,
                units: 10,
                Amount: 1500,
                averageOpen: 1500,
                currentRate: 1520,
                currency: "GBp",
                openTimestamp: "2026-06-02T16:30:00Z",
              },
            ],
          },
        })
      }

      if (requestUrl.includes("/trading/info/real/pnl")) {
        return new Response("unused", { status: 404 })
      }

      if (requestUrl.includes("/trading/info/real/history") || requestUrl.includes("/trading/info/trade/history")) {
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
        return Response.json({
          instrumentDisplayDatas: [
            { instrumentID: 2072, instrumentDisplayName: "Rolls-Royce Holdings", symbolFull: "RR.L", priceSource: "LSE" },
            { instrumentID: 137, instrumentDisplayName: "NVIDIA Corporation", symbolFull: "NVDA", priceSource: "NASDAQ" },
          ],
        })
      }

      if (requestUrl.includes("/market-data/instruments/rates")) {
        return Response.json({ rates: [] })
      }

      return new Response("unexpected request", { status: 404 })
    })

    vi.stubGlobal("fetch", fetchMock)

    const syncData = await fetchEtoroSyncDataFromApi({ apiKey: "api-key", apiSecret: "user-key" })
    const rollsRoyceBuy = syncData.activity.find((event) => event.ticker === "RR" && event.orderType === "Open")

    expect(syncData.positions.map((position) => position.ticker)).toEqual(["RR"])
    expect(rollsRoyceBuy).toMatchObject({
      broker: "etoro",
      ticker: "RR",
      type: "buy",
      timestamp: "2026-06-02T16:30:00Z",
      shares: 10,
      price: 15,
      nativeCurrency: "GBP",
      grossAmountGbp: 150,
    })
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

  it("merges current and legacy eToro history endpoints", async () => {
    const requestUrls: string[] = []
    const fetchMock = vi.fn(async (url: string | URL | Request) => {
      const requestUrl = String(url)
      requestUrls.push(requestUrl)

      if (requestUrl.includes("/trading/info/real/history")) {
        return Response.json([
          {
            instrumentID: 137,
            symbolFull: "NVDA",
            instrumentDisplayName: "NVIDIA Corporation",
            isBuy: true,
            openTimestamp: "2026-06-02T09:00:00Z",
            closeTimestamp: "2026-06-02T15:00:00Z",
            openRate: 100,
            closeRate: 110,
            investment: 1000,
            units: 10,
          },
        ])
      }

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

    expect(activity.map((event) => event.timestamp)).toEqual([
      "2026-06-02T09:00:00Z",
      "2026-06-02T15:00:00Z",
      "2026-06-01T09:00:00Z",
      "2026-06-01T15:00:00Z",
    ])
    expect(requestUrls.some((url) => url.includes("/trading/info/real/history"))).toBe(true)
    expect(requestUrls.some((url) => url.includes("/trading/info/trade/history"))).toBe(true)
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

  it("maps eToro net profit in GBP when the account currency is inferred as GBP", async () => {
    const fetchMock = vi.fn(async (url: string | URL | Request) => {
      const requestUrl = String(url)

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
            netProfit: 150,
          },
        ])
      }

      if (requestUrl.includes("/market-data/instruments?")) {
        return Response.json({
          instrumentDisplayDatas: [
            { instrumentID: 1137, instrumentDisplayName: "NVIDIA Corporation", symbolFull: "NVDA", priceSource: "NASDAQ" },
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
    const sell = activity.find((event) => event.orderType === "Close")

    expect(sell?.realisedProfitGbp).toBe(150)
  })

  it("maps eToro portfolio rows that only expose symbolFull", () => {
    const payload = {
      clientPortfolio: {
        positions: [
          {
            instrumentID: 1137,
            symbolFull: "NVDA",
            instrumentDisplayName: "NVIDIA Corporation",
            IsBuy: true,
            units: 2,
            Amount: 1000,
            averageOpen: 500,
            currentRate: 510,
            currency: "USD",
          },
        ],
      },
    }

    const positions = mapEtoroPortfolioResponse(payload)

    expect(positions).toHaveLength(1)
    expect(positions[0]?.ticker).toBe("NVDA")
    expect(positions[0]?.companyName).toBe("NVIDIA Corporation")
    expect(positions[0]?.shares).toBe(2)
  })

  it("maps PnL positions that only expose amount and nested unrealizedPnL", () => {
    const payload = {
      clientPortfolio: {
        positions: [
          {
            positionID: 9001,
            instrumentID: 1137,
            symbolFull: "NVDA",
            instrumentDisplayName: "NVIDIA Corporation",
            isBuy: true,
            leverage: 1,
            amount: 820.72,
            openRate: 180,
            currentRate: 182,
            currency: "USD",
            unrealizedPnL: { pnL: 42.5 },
          },
        ],
      },
    }

    const positions = mapEtoroPortfolioResponse(payload)

    expect(positions).toHaveLength(1)
    expect(positions[0]?.ticker).toBe("NVDA")
    expect(positions[0]?.externalPositionId).toBe("position:9001")
    expect(positions[0]?.normalizedTotalValueGbp).toBeGreaterThan(0)
    expect(positions[0]?.totalPL).toBeCloseTo(42.5 * 0.79, 2)
  })

  it("dedupes duplicate eToro position IDs before mapping", () => {
    const payload = {
      clientPortfolio: {
        positions: [
          {
            positionID: 9001,
            instrumentID: 1137,
            symbolFull: "NVDA",
            isBuy: true,
            amount: 400,
            openRate: 180,
            currentRate: 182,
          },
          {
            positionID: 9001,
            instrumentID: 1137,
            symbolFull: "NVDA",
            isBuy: true,
            amount: 400,
            openRate: 180,
            currentRate: 182,
          },
        ],
      },
    }

    const positions = mapEtoroPortfolioResponse(payload)

    expect(positions).toHaveLength(1)
  })

  it("includes mirror portfolio positions from the PnL payload", () => {
    const payload = {
      clientPortfolio: {
        positions: [],
        mirrors: [
          {
            positions: [
              {
                positionID: 9101,
                instrumentID: 1137,
                symbolFull: "NVDA",
                isBuy: true,
                amount: 500,
                units: 2,
                openRate: 250,
                currentRate: 255,
                currency: "USD",
              },
            ],
          },
        ],
      },
    }

    const positions = mapEtoroPortfolioResponse(payload)

    expect(positions).toHaveLength(1)
    expect(positions[0]?.ticker).toBe("NVDA")
  })

  it("extracts account cash and equity from the client portfolio payload", () => {
    const snapshot = extractEtoroAccountSnapshot({
      clientPortfolio: {
        credit: 125.5,
        totalInvested: 820.72,
        equity: 946.22,
        currency: "USD",
      },
    })

    expect(snapshot).toEqual({
      broker: "etoro",
      currency: "USD",
      availableCash: 125.5,
      investedAmount: 820.72,
      totalEquity: 946.22,
      holdingsValue: null,
      unrealizedPl: null,
    })
  })

  it("loads open positions from the PnL endpoint when the portfolio endpoint is empty", async () => {
    const fetchMock = vi.fn(async (url: string | URL | Request) => {
      const requestUrl = String(url)

      if (requestUrl.includes("/trading/info/real/pnl")) {
        return Response.json({
          clientPortfolio: {
            positions: [
              {
                instrumentID: 1137,
                symbolFull: "NVDA",
                instrumentDisplayName: "NVIDIA Corporation",
                IsBuy: true,
                units: 2,
                investment: 1000,
                OpenRate: 500,
                currentRate: 510,
                currency: "USD",
              },
            ],
          },
        })
      }

      if (requestUrl.includes("/trading/info/portfolio")) {
        return Response.json({ clientPortfolio: { positions: [] } })
      }

      if (requestUrl.includes("/market-data/instruments?")) {
        return Response.json({
          instrumentDisplayDatas: [
            { instrumentID: 1137, instrumentDisplayName: "NVIDIA Corporation", symbolFull: "NVDA", priceSource: "NASDAQ" },
          ],
        })
      }

      if (requestUrl.includes("/market-data/instruments/rates")) {
        return Response.json({ rates: [] })
      }

      return new Response("unexpected request", { status: 404 })
    })

    vi.stubGlobal("fetch", fetchMock)

    const positions = await fetchEtoroPortfolioFromApi({ apiKey: "api-key", apiSecret: "user-key" })

    expect(positions).toHaveLength(1)
    expect(positions[0]?.ticker).toBe("NVDA")
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("/trading/info/real/pnl"))).toBe(true)
  })

  it("falls back to the portfolio endpoint when the PnL endpoint returns no rows", async () => {
    const fetchMock = vi.fn(async (url: string | URL | Request) => {
      const requestUrl = String(url)

      if (requestUrl.includes("/trading/info/real/pnl")) {
        return Response.json({ clientPortfolio: { positions: [] } })
      }

      if (requestUrl.includes("/trading/info/portfolio")) {
        return Response.json({
          clientPortfolio: {
            positions: [
              {
                instrumentID: 1137,
                symbolFull: "NVDA",
                instrumentDisplayName: "NVIDIA Corporation",
                IsBuy: true,
                units: 2,
                Amount: 1000,
                averageOpen: 500,
                currentRate: 510,
                currency: "USD",
              },
            ],
          },
        })
      }

      if (requestUrl.includes("/market-data/instruments?")) {
        return Response.json({
          instrumentDisplayDatas: [
            { instrumentID: 1137, instrumentDisplayName: "NVIDIA Corporation", symbolFull: "NVDA", priceSource: "NASDAQ" },
          ],
        })
      }

      if (requestUrl.includes("/market-data/instruments/rates")) {
        return Response.json({ rates: [] })
      }

      return new Response("unexpected request", { status: 404 })
    })

    vi.stubGlobal("fetch", fetchMock)

    const positions = await fetchEtoroPortfolioFromApi({ apiKey: "api-key", apiSecret: "user-key" })

    expect(positions).toHaveLength(1)
    expect(positions[0]?.ticker).toBe("NVDA")
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("/trading/info/portfolio"))).toBe(true)
  })
})

