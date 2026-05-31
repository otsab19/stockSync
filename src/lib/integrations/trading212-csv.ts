import { normalizeImportedHolding, inferAssetType } from "@/lib/portfolio/position-normalizer"
import type { AssetType, PortfolioPosition } from "@/types/portfolio"

const CURRENT_PRICE_HEADER_CANDIDATES = [
  "current price",
  "market price",
  "live price",
  "price now",
  "last price",
]

const ACTION_HEADER_CANDIDATES = ["action", "type", "transaction type"]
const TICKER_HEADER_CANDIDATES = ["ticker", "symbol", "instrument ticker"]
const NAME_HEADER_CANDIDATES = ["name", "instrument", "company name", "instrument name"]
const SHARES_HEADER_CANDIDATES = ["no of shares", "no shares", "number of shares", "shares", "quantity", "units"]
const PRICE_HEADER_CANDIDATES = ["price share", "price per share", "price", "execution price", "average price", "avg price"]
const AVERAGE_PRICE_HEADER_CANDIDATES = ["average price", "avg price", "average cost", "cost per share"]
const CURRENCY_HEADER_CANDIDATES = ["currency price share", "currency", "instrument currency", "price currency"]
const ASSET_TYPE_HEADER_CANDIDATES = ["asset type", "instrument type", "category"]

const BUY_ACTIONS = ["buy", "market buy", "limit buy"]
const SELL_ACTIONS = ["sell", "market sell", "limit sell"]

const MINIMUM_REMAINING_SHARES = 0.000001

type ParsedRow = Record<string, string>

type AggregatedHolding = {
  ticker: string
  companyName: string
  shares: number
  costBasisNative: number
  nativeCurrency: "GBP" | "USD"
  assetType: AssetType
  currentPrice?: number
}

function detectDelimiter(input: string) {
  const firstPopulatedLine = input
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean) ?? ""

  const candidates = [",", ";", "\t"] as const
  let bestDelimiter: (typeof candidates)[number] = ","
  let bestScore = 0

  candidates.forEach((candidate) => {
    const score = firstPopulatedLine.split(candidate).length

    if (score > bestScore) {
      bestDelimiter = candidate
      bestScore = score
    }
  })

  return bestDelimiter
}

function parseCsv(input: string) {
  const sanitized = input.replace(/^\uFEFF/, "")
  const delimiter = detectDelimiter(sanitized)
  const rows: string[][] = []
  let currentCell = ""
  let currentRow: string[] = []
  let inQuotes = false

  for (let index = 0; index < sanitized.length; index += 1) {
    const character = sanitized[index]
    const nextCharacter = sanitized[index + 1]

    if (character === '"') {
      if (inQuotes && nextCharacter === '"') {
        currentCell += '"'
        index += 1
        continue
      }

      inQuotes = !inQuotes
      continue
    }

    if (!inQuotes && character === delimiter) {
      currentRow.push(currentCell.trim())
      currentCell = ""
      continue
    }

    if (!inQuotes && (character === "\n" || character === "\r")) {
      if (character === "\r" && nextCharacter === "\n") {
        index += 1
      }

      currentRow.push(currentCell.trim())
      currentCell = ""

      if (currentRow.some((value) => value.length > 0)) {
        rows.push(currentRow)
      }

      currentRow = []
      continue
    }

    currentCell += character
  }

  currentRow.push(currentCell.trim())
  if (currentRow.some((value) => value.length > 0)) {
    rows.push(currentRow)
  }

  return rows
}

function normalizeHeader(header: string) {
  return header
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
}

function rowsToObjects(rows: string[][]): ParsedRow[] {
  const [headerRow, ...dataRows] = rows
  const headers = headerRow.map(normalizeHeader)

  return dataRows.map((row) => {
    const entries = headers.map((header, index) => [header, row[index] ?? ""])
    return Object.fromEntries(entries)
  })
}

function readValue(row: ParsedRow, candidates: string[]) {
  for (const candidate of candidates) {
    const value = row[candidate]

    if (value !== undefined && value !== "") {
      return value
    }
  }

  return ""
}

function parseNumber(rawValue: string) {
  const normalized = rawValue
    .replace(/,/g, "")
    .replace(/[£$€]/g, "")
    .replace(/\s+/g, "")
    .replace(/^\((.*)\)$/, "-$1")

  const numericValue = Number(normalized)

  if (!Number.isFinite(numericValue)) {
    throw new Error(`Unable to parse numeric value: ${rawValue}`)
  }

  return numericValue
}

function parseOptionalNumber(rawValue: string) {
  if (!rawValue.trim()) {
    return undefined
  }

  return parseNumber(rawValue)
}

function normalizeCurrency(rawValue: string): "GBP" | "USD" {
  const normalized = rawValue.trim().toUpperCase()

  if (normalized.includes("GBP") || normalized.includes("£")) {
    return "GBP"
  }

  if (normalized.includes("USD") || normalized.includes("$")) {
    return "USD"
  }

  return "GBP"
}

function normalizeAction(rawValue: string) {
  return rawValue
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
}

function resolveAssetType(row: ParsedRow, companyName: string) {
  const assetTypeValue = readValue(row, ASSET_TYPE_HEADER_CANDIDATES)
  return inferAssetType(assetTypeValue || companyName)
}

function hasAnyHeader(row: ParsedRow, candidates: string[]) {
  return candidates.some((candidate) => candidate in row)
}

function parseTransactionRows(rows: ParsedRow[]): PortfolioPosition[] {
  const holdings = new Map<string, AggregatedHolding>()
  let supportedTransactionCount = 0

  rows.forEach((row, rowIndex) => {
    const action = normalizeAction(readValue(row, ACTION_HEADER_CANDIDATES))

    if (!BUY_ACTIONS.includes(action) && !SELL_ACTIONS.includes(action)) {
      return
    }

    supportedTransactionCount += 1

    const ticker = readValue(row, TICKER_HEADER_CANDIDATES).trim().toUpperCase()
    const companyName = readValue(row, NAME_HEADER_CANDIDATES).trim() || ticker
    const shares = Math.abs(parseNumber(readValue(row, SHARES_HEADER_CANDIDATES)))
    const price = Math.abs(parseNumber(readValue(row, PRICE_HEADER_CANDIDATES)))
    const currency = normalizeCurrency(readValue(row, CURRENCY_HEADER_CANDIDATES))
    const assetType = resolveAssetType(row, companyName)
    const currentPrice = parseOptionalNumber(readValue(row, CURRENT_PRICE_HEADER_CANDIDATES))

    if (!ticker) {
      throw new Error(`Row ${rowIndex + 2} is missing a ticker symbol.`)
    }

    if (shares <= 0) {
      return
    }

    const key = `${ticker}:${currency}`
    const existing = holdings.get(key) ?? {
      ticker,
      companyName,
      shares: 0,
      costBasisNative: 0,
      nativeCurrency: currency,
      assetType,
      currentPrice,
    }

    existing.companyName = companyName || existing.companyName
    existing.assetType = assetType
    existing.currentPrice = currentPrice ?? existing.currentPrice

    if (BUY_ACTIONS.includes(action)) {
      existing.costBasisNative += shares * price
      existing.shares += shares
      holdings.set(key, existing)
      return
    }

    if (existing.shares < shares - MINIMUM_REMAINING_SHARES) {
      throw new Error(`Row ${rowIndex + 2} sells more ${ticker} shares than are currently held in the parsed history.`)
    }

    const currentAverageCost = existing.shares <= MINIMUM_REMAINING_SHARES
      ? 0
      : existing.costBasisNative / existing.shares

    existing.costBasisNative = Math.max(existing.costBasisNative - currentAverageCost * shares, 0)
    existing.shares = Math.max(existing.shares - shares, 0)

    if (existing.shares <= MINIMUM_REMAINING_SHARES) {
      existing.shares = 0
      existing.costBasisNative = 0
    }

    holdings.set(key, existing)
  })

  if (supportedTransactionCount === 0) {
    throw new Error("No supported Trading 212 buy or sell transactions were found in the uploaded CSV.")
  }

  return Array.from(holdings.values())
    .filter((holding) => holding.shares > MINIMUM_REMAINING_SHARES)
    .map((holding) => normalizeImportedHolding({
      broker: "t212",
      brokerLabel: "Trading 212",
      ticker: holding.ticker,
      companyName: holding.companyName,
      shares: Number(holding.shares.toFixed(8)),
      avgPrice: holding.costBasisNative / holding.shares,
      livePrice: holding.currentPrice ?? holding.costBasisNative / holding.shares,
      nativeCurrency: holding.nativeCurrency,
      assetType: holding.assetType,
    }))
    .sort((left, right) => left.ticker.localeCompare(right.ticker))
}

function parseHoldingRows(rows: ParsedRow[]): PortfolioPosition[] {
  const holdings = rows
    .map((row, rowIndex) => {
      const ticker = readValue(row, TICKER_HEADER_CANDIDATES).trim().toUpperCase()
      const shares = Math.abs(parseNumber(readValue(row, SHARES_HEADER_CANDIDATES)))
      const avgPrice = Math.abs(parseNumber(readValue(row, AVERAGE_PRICE_HEADER_CANDIDATES) || readValue(row, PRICE_HEADER_CANDIDATES)))
      const currentPrice = parseOptionalNumber(readValue(row, CURRENT_PRICE_HEADER_CANDIDATES)) ?? avgPrice
      const companyName = readValue(row, NAME_HEADER_CANDIDATES).trim() || ticker
      const currency = normalizeCurrency(readValue(row, CURRENCY_HEADER_CANDIDATES))

      if (!ticker) {
        throw new Error(`Row ${rowIndex + 2} is missing a ticker symbol.`)
      }

      return normalizeImportedHolding({
        broker: "t212",
        brokerLabel: "Trading 212",
        ticker,
        companyName,
        shares,
        avgPrice,
        livePrice: currentPrice,
        nativeCurrency: currency,
        assetType: resolveAssetType(row, companyName),
      })
    })
    .filter((position) => position.shares > MINIMUM_REMAINING_SHARES)
    .sort((left, right) => left.ticker.localeCompare(right.ticker))

  if (holdings.length === 0) {
    throw new Error("The uploaded CSV did not contain any open holdings to import.")
  }

  return holdings
}

export function importTrading212PortfolioFromCsv(csvText: string): PortfolioPosition[] {
  const parsedRows = parseCsv(csvText)

  if (parsedRows.length < 2) {
    throw new Error("The uploaded CSV must contain a header row and at least one data row.")
  }

  const objectRows = rowsToObjects(parsedRows)
  const firstRow = objectRows[0]

  const looksLikeTransactions = hasAnyHeader(firstRow, ACTION_HEADER_CANDIDATES)

  return looksLikeTransactions ? parseTransactionRows(objectRows) : parseHoldingRows(objectRows)
}

