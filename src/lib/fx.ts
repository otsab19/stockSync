const FALLBACK_USD_TO_GBP = 0.79
const CACHE_TTL_MS = 60_000

let cachedRate: number | null = null
let cachedAt = 0

/**
 * Fetches the live USD→GBP rate from frankfurter.app, with a 60-second in-process cache.
 * Falls back to 0.79 if the request fails or the server environment has no internet access.
 */
export async function getUsdToGbpRate(): Promise<number> {
  const now = Date.now()
  if (cachedRate !== null && now - cachedAt < CACHE_TTL_MS) {
    return cachedRate
  }

  try {
    const response = await fetch("https://api.frankfurter.app/latest?base=USD&symbols=GBP", {
      cache: "no-store",
      signal: AbortSignal.timeout(4_000),
    })

    if (!response.ok) {
      return cachedRate ?? FALLBACK_USD_TO_GBP
    }

    const data = await response.json() as { rates?: { GBP?: number } }
    const rate = data?.rates?.GBP

    if (typeof rate === "number" && Number.isFinite(rate) && rate > 0) {
      cachedRate = rate
      cachedAt = now
      return rate
    }
  } catch {
    // network error or timeout — return cached or fallback
  }

  return cachedRate ?? FALLBACK_USD_TO_GBP
}

/** Synchronous version for use inside mappers that already received the rate from a calling context. */
export function convertUsdToGbp(amount: number, rate: number): number {
  return amount * rate
}
