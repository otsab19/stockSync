const STORAGE_KEY = "stocksync:alert_thresholds"
const GLOBAL_THRESHOLD_KEY = "__global__"

export type TickerThreshold = {
  ticker: string
  thresholdGbp: number
  nearWindowGbp: number
}

type ThresholdStore = Record<string, TickerThreshold>

function readStore(): ThresholdStore {
  if (typeof window === "undefined") return {}
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as ThresholdStore) : {}
  } catch {
    return {}
  }
}

function writeStore(store: ThresholdStore) {
  if (typeof window === "undefined") return
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store))
}

export function getGlobalThreshold(): { thresholdGbp: number; nearWindowGbp: number } {
  const store = readStore()
  const entry = store[GLOBAL_THRESHOLD_KEY]
  return {
    thresholdGbp: entry?.thresholdGbp ?? 25,
    nearWindowGbp: entry?.nearWindowGbp ?? 5,
  }
}

export function setGlobalThreshold(thresholdGbp: number, nearWindowGbp: number) {
  const store = readStore()
  store[GLOBAL_THRESHOLD_KEY] = {
    ticker: GLOBAL_THRESHOLD_KEY,
    thresholdGbp,
    nearWindowGbp,
  }
  writeStore(store)
}

export function getTickerThreshold(ticker: string): TickerThreshold | null {
  const store = readStore()
  return store[ticker.toUpperCase()] ?? null
}

export function setTickerThreshold(ticker: string, thresholdGbp: number, nearWindowGbp: number) {
  const store = readStore()
  store[ticker.toUpperCase()] = { ticker: ticker.toUpperCase(), thresholdGbp, nearWindowGbp }
  writeStore(store)
}

export function removeTickerThreshold(ticker: string) {
  const store = readStore()
  delete store[ticker.toUpperCase()]
  writeStore(store)
}

export function getAllTickerThresholds(): TickerThreshold[] {
  const store = readStore()
  return Object.values(store).filter((t) => t.ticker !== GLOBAL_THRESHOLD_KEY)
}

export function resolveThresholdForTicker(ticker: string): { thresholdGbp: number; nearWindowGbp: number } {
  const perTicker = getTickerThreshold(ticker)
  if (perTicker) {
    return { thresholdGbp: perTicker.thresholdGbp, nearWindowGbp: perTicker.nearWindowGbp }
  }
  return getGlobalThreshold()
}
