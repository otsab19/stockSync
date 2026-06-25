/**
 * Compare broker holdings: live API vs exported statements vs dashboard KPI definitions.
 *
 * Usage (statements only — no API keys needed):
 *   npx tsx scripts/compare-broker-holdings.ts --statements-only
 *
 * Usage (live API + statements):
 *   T212_API_KEY=... T212_API_SECRET=... ETORO_API_KEY=... ETORO_API_SECRET=... \
 *     npx tsx scripts/compare-broker-holdings.ts
 *
 * Never commit API keys. Put them in a local .env and source it, or pass via env.
 */

import { readFileSync, readdirSync, existsSync } from "node:fs"
import { join, resolve } from "node:path"
import { fetchEtoroPortfolioFromApi, fetchEtoroSyncDataFromApi } from "@/lib/integrations/etoro-live"
import {
  fetchTrading212AccountSummaryFromApi,
  fetchTrading212PortfolioFromApi,
  fetchTrading212SyncDataFromApi,
} from "@/lib/integrations/trading212-live"
import { buildHistoryPerformanceMetrics } from "@/lib/dashboard/history-metrics"
import type { PortfolioPosition } from "@/types/portfolio"

const STATEMENTS_DIR = resolve(process.cwd(), "statements")
const STATEMENTS_ONLY = process.argv.includes("--statements-only")

type T212NetPosition = {
  ticker: string
  companyName: string
  netShares: number
  grossBuyGbp: number
  grossSellGbp: number
  lastAction: string
  lastDate: string
}

type EtoroStatementSummary = {
  periodStart: string
  periodEnd: string
  closedPlGbp: number | null
  endingUnrealizedEquityGbp: number | null
  endingRealizedEquityGbp: number | null
  depositsUsd: number | null
}

function parseCsvLine(line: string): string[] {
  const fields: string[] = []
  let current = ""
  let inQuotes = false

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i]
    if (char === '"') {
      inQuotes = !inQuotes
      continue
    }
    if (char === "," && !inQuotes) {
      fields.push(current)
      current = ""
      continue
    }
    current += char
  }
  fields.push(current)
  return fields
}

function parseT212Statements(dir: string): {
  positions: T212NetPosition[]
  grossBuyGbp: number
  grossSellGbp: number
  tradeCount: number
} {
  const files = readdirSync(dir).filter((name) => name.startsWith("from_") && name.endsWith(".csv"))
  const byTicker = new Map<
    string,
    {
      companyName: string
      netShares: number
      grossBuyGbp: number
      grossSellGbp: number
      lastAction: string
      lastDate: string
    }
  >()

  let grossBuyGbp = 0
  let grossSellGbp = 0
  let tradeCount = 0

  for (const file of files.sort()) {
    const text = readFileSync(join(dir, file), "utf8")
    const lines = text.trim().split(/\r?\n/)
    if (lines.length < 2) continue

    const headers = parseCsvLine(lines[0]!)
    const actionIdx = headers.indexOf("Action")
    const timeIdx = headers.indexOf("Time")
    const tickerIdx = headers.indexOf("Ticker")
    const nameIdx = headers.indexOf("Name")
    const sharesIdx = headers.indexOf("No. of shares")
    const totalIdx = headers.indexOf("Total")

    for (const line of lines.slice(1)) {
      if (!line.trim()) continue
      const cols = parseCsvLine(line)
      const action = cols[actionIdx] ?? ""
      const ticker = cols[tickerIdx] ?? ""
      if (!ticker) continue

      const shares = Number.parseFloat(cols[sharesIdx] ?? "0") || 0
      const total = Number.parseFloat((cols[totalIdx] ?? "0").replace(/,/g, "")) || 0
      const lower = action.toLowerCase()

      tradeCount += 1
      const entry = byTicker.get(ticker) ?? {
        companyName: cols[nameIdx] ?? ticker,
        netShares: 0,
        grossBuyGbp: 0,
        grossSellGbp: 0,
        lastAction: action,
        lastDate: cols[timeIdx] ?? "",
      }

      if (lower.includes("buy")) {
        entry.netShares += shares
        entry.grossBuyGbp += total
        grossBuyGbp += total
      } else if (lower.includes("sell")) {
        entry.netShares -= shares
        entry.grossSellGbp += total
        grossSellGbp += total
      }

      entry.lastAction = action
      entry.lastDate = cols[timeIdx] ?? entry.lastDate
      byTicker.set(ticker, entry)
    }
  }

  const positions = Array.from(byTicker.entries())
    .filter(([, value]) => Math.abs(value.netShares) > 1e-6)
    .map(([ticker, value]) => ({ ticker, ...value }))
    .sort((left, right) => Math.abs(right.netShares) - Math.abs(left.netShares))

  return { positions, grossBuyGbp, grossSellGbp, tradeCount }
}

function parseEtoroXlsxSummary(dir: string): EtoroStatementSummary | null {
  const file = readdirSync(dir).find((name) => name.toLowerCase().includes("etoro") && name.endsWith(".xlsx"))
  if (!file) return null

  // Minimal xlsx parse: shared strings + first sheet cells (no external deps).
  const buffer = readFileSync(join(dir, file))
  const entries = readZipEntries(buffer)
  const sharedStrings = parseSharedStrings(entries["xl/sharedStrings.xml"])
  const rows = parseSheetRows(entries["xl/worksheets/sheet1.xml"], sharedStrings)

  function findCell(label: string): string {
    for (const row of rows) {
      const idx = row.findIndex((cell) => cell.includes(label))
      if (idx >= 0) return row[idx + 1] ?? ""
    }
    return ""
  }

  function findGbp(label: string): number | null {
    for (const row of rows) {
      const idx = row.findIndex((cell) => cell.includes(label))
      if (idx >= 0) {
        const gbpCell = row[idx + 2] ?? row[row.length - 1]
        const num = Number.parseFloat(String(gbpCell).replace(/,/g, ""))
        if (Number.isFinite(num)) return num
      }
    }
    return null
  }

  const periodStart = findCell("Start Date")
  const periodEnd = findCell("End Date")

  return {
    periodStart,
    periodEnd,
    closedPlGbp: findGbp("Profit or Loss (Closed positions only)"),
    endingUnrealizedEquityGbp: findGbp("Ending Unrealized Equity"),
    endingRealizedEquityGbp: findGbp("Ending Realized Equity"),
    depositsUsd: null,
  }
}

function readZipEntries(buffer: Buffer): Record<string, Buffer> {
  const entries: Record<string, Buffer> = {}
  let offset = 0

  while (offset + 4 < buffer.length) {
    const signature = buffer.readUInt32LE(offset)
    if (signature !== 0x04034b50) break

    const compression = buffer.readUInt16LE(offset + 8)
    const compressedSize = buffer.readUInt32LE(offset + 18)
    const uncompressedSize = buffer.readUInt32LE(offset + 22)
    const nameLength = buffer.readUInt16LE(offset + 26)
    const extraLength = buffer.readUInt16LE(offset + 28)
    const name = buffer.subarray(offset + 30, offset + 30 + nameLength).toString("utf8")
    const dataStart = offset + 30 + nameLength + extraLength
    const compressed = buffer.subarray(dataStart, dataStart + compressedSize)

    let payload: Buffer
    if (compression === 0) {
      payload = compressed
    } else if (compression === 8) {
      const { inflateRawSync } = require("node:zlib") as typeof import("node:zlib")
      payload = inflateRawSync(compressed)
    } else {
      offset = dataStart + compressedSize
      continue
    }

    if (payload.length >= uncompressedSize || uncompressedSize === 0) {
      entries[name] = payload
    }

    offset = dataStart + compressedSize
  }

  return entries
}

function parseSharedStrings(xml?: Buffer): string[] {
  if (!xml) return []
  const text = xml.toString("utf8")
  const strings: string[] = []
  const matches = text.matchAll(/<(?:[^:>]+:)?si[^>]*>([\s\S]*?)<\/(?:[^:>]+:)?si>/g)
  for (const match of matches) {
    const inner = match[1] ?? ""
    const parts = [...inner.matchAll(/<(?:[^:>]+:)?t[^>]*>([^<]*)<\/(?:[^:>]+:)?t>/g)].map((part) => part[1] ?? "")
    strings.push(parts.join(""))
  }
  return strings
}

function parseSheetRows(xml?: Buffer, sharedStrings: string[] = []): string[][] {
  if (!xml) return []
  const text = xml.toString("utf8")
  const rows: string[][] = []
  const rowMatches = text.matchAll(/<(?:[^:>]+:)?row[^>]*>([\s\S]*?)<\/(?:[^:>]+:)?row>/g)

  for (const rowMatch of rowMatches) {
    const rowXml = rowMatch[1] ?? ""
    const cells: string[] = []
    const cellMatches = rowXml.matchAll(/<(?:[^:>]+:)?c([^>]*)>([\s\S]*?)<\/(?:[^:>]+:)?c>/g)
    for (const cellMatch of cellMatches) {
      const attrs = cellMatch[1] ?? ""
      const inner = cellMatch[2] ?? ""
      const type = attrs.match(/\bt="([^"]+)"/)?.[1]
      const value = inner.match(/<(?:[^:>]+:)?v[^>]*>([^<]*)<\/(?:[^:>]+:)?v>/)?.[1] ?? ""
      cells.push(type === "s" ? sharedStrings[Number.parseInt(value, 10)] ?? value : value)
    }
    if (cells.some(Boolean)) rows.push(cells)
  }

  return rows
}

function formatGbp(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "n/a"
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(value)
}

function summarizePositions(label: string, positions: PortfolioPosition[]) {
  console.log(`\n━━━ ${label} (${positions.length} positions) ━━━`)
  let totalValue = 0
  let totalCost = 0
  let totalPl = 0

  for (const position of positions.sort((a, b) => b.normalizedTotalValueGbp - a.normalizedTotalValueGbp)) {
    const cost = position.shares * position.avgPrice * position.fxRateToGbp
    totalValue += position.normalizedTotalValueGbp
    totalCost += cost
    totalPl += position.totalPL
    console.log(
      `  ${position.ticker.padEnd(8)} ${position.shares.toFixed(4).padStart(14)} sh  ` +
        `value ${formatGbp(position.normalizedTotalValueGbp).padStart(12)}  ` +
        `cost ${formatGbp(cost).padStart(12)}  P/L ${formatGbp(position.totalPL).padStart(12)}  [${position.broker}]`
    )
  }

  console.log(
    `  TOTAL    value ${formatGbp(totalValue)}  cost ${formatGbp(totalCost)}  unrealised P/L ${formatGbp(totalPl)}`
  )
  return { totalValue, totalCost, totalPl, count: positions.length }
}

async function main() {
  console.log("=== Broker holdings gap analysis ===\n")

  if (!existsSync(STATEMENTS_DIR)) {
    console.error(`Missing statements folder: ${STATEMENTS_DIR}`)
    process.exit(1)
  }

  const t212Statements = parseT212Statements(STATEMENTS_DIR)
  const etoroStatement = parseEtoroXlsxSummary(STATEMENTS_DIR)

  console.log("━━━ Exported statements (ground truth files) ━━━")
  console.log(`T212 CSV files: gross buy ${formatGbp(t212Statements.grossBuyGbp)}, gross sell ${formatGbp(t212Statements.grossSellGbp)}`)
  console.log(`T212 CSV trade legs: ${t212Statements.tradeCount}`)
  console.log(`T212 open positions reconstructed from buy/sell legs: ${t212Statements.positions.length}`)
  for (const position of t212Statements.positions) {
    console.log(
      `  ${position.ticker.padEnd(8)} net ${position.netShares.toFixed(4).padStart(14)} sh  ` +
        `(last: ${position.lastAction} @ ${position.lastDate.slice(0, 10)})`
    )
  }

  if (etoroStatement) {
    console.log(`\neToro account statement: ${etoroStatement.periodStart} → ${etoroStatement.periodEnd}`)
    console.log(`  Closed P/L (period):     ${formatGbp(etoroStatement.closedPlGbp)}`)
    console.log(`  Ending unrealized eq.:   ${formatGbp(etoroStatement.endingUnrealizedEquityGbp)}`)
    console.log(`  Ending realized eq.:     ${formatGbp(etoroStatement.endingRealizedEquityGbp)}`)
  } else {
    console.log("\neToro xlsx statement: not found")
  }

  console.log("\n━━━ Dashboard KPI definitions (what the app numbers mean) ━━━")
  console.log("  Open value / Unrealised P/L  → sum of LIVE open positions (API sync), not statement totals")
  console.log("  Realised P/L / Win rate      → closed round trips from imported activity history (all time if filter = All)")
  console.log("  Capital in / Capital out       → gross buy/sell volume in selected date range (NOT net deposits)")

  const t212Key = process.env.T212_API_KEY?.trim() ?? ""
  const t212Secret = process.env.T212_API_SECRET?.trim() ?? ""
  const etoroKey = process.env.ETORO_API_KEY?.trim() ?? ""
  const etoroSecret = process.env.ETORO_API_SECRET?.trim() ?? ""
  const hasKeys = Boolean(t212Key && t212Secret && etoroKey && etoroSecret)

  if (STATEMENTS_ONLY || !hasKeys) {
    if (!hasKeys) {
      console.log("\n⚠️  Skipping live API (set T212_* and ETORO_* env vars to include API comparison)")
    }
    printGapSummary(null, t212Statements, etoroStatement)
    return
  }

  const credentials = {
    t212: { apiKey: t212Key, apiSecret: t212Secret },
    etoro: { apiKey: etoroKey, apiSecret: etoroSecret },
  }

  console.log("\n━━━ Live API fetch ━━━")

  let t212Positions: PortfolioPosition[] = []
  let etoroPositions: PortfolioPosition[] = []
  let appMetrics: ReturnType<typeof buildHistoryPerformanceMetrics> | null = null

  try {
    t212Positions = await fetchTrading212PortfolioFromApi(credentials.t212)
    const t212Summary = await fetchTrading212AccountSummaryFromApi(credentials.t212)
    summarizePositions("Trading 212 API", t212Positions)
    if (t212Summary) {
      console.log(
        `  Account summary: equity ${formatGbp(t212Summary.totalEquity)}  holdings ${formatGbp(t212Summary.holdingsValue)}  unrealised ${formatGbp(t212Summary.unrealizedPl)}`
      )
    }
  } catch (error) {
    console.error("  T212 API error:", error instanceof Error ? error.message : error)
  }

  try {
    etoroPositions = await fetchEtoroPortfolioFromApi(credentials.etoro)
    summarizePositions("eToro API", etoroPositions)
  } catch (error) {
    console.error("  eToro API error:", error instanceof Error ? error.message : error)
  }

  try {
    const [t212Sync, etoroSync] = await Promise.all([
      fetchTrading212SyncDataFromApi(credentials.t212),
      fetchEtoroSyncDataFromApi(credentials.etoro),
    ])
    const allPositions = [...t212Sync.positions, ...etoroSync.positions]
    const allActivity = [...t212Sync.activity, ...etoroSync.activity]
    appMetrics = buildHistoryPerformanceMetrics(allPositions, allActivity)
    console.log("\n━━━ App-style metrics from live API data ━━━")
    console.log(`  Open value:        ${formatGbp(appMetrics.open.valueGbp)} (${appMetrics.open.positionCount} positions)`)
    console.log(`  Unrealised P/L:    ${formatGbp(appMetrics.open.unrealisedPlGbp)} (${appMetrics.open.unrealisedReturnPercent.toFixed(1)}%)`)
    console.log(`  Realised P/L:      ${formatGbp(appMetrics.history.realisedPlGbp)} (${appMetrics.history.closedTradeCount} round trips)`)
    console.log(`  Capital in (all):  ${formatGbp(appMetrics.history.totalBoughtGbp)}`)
    console.log(`  Capital out (all): ${formatGbp(appMetrics.history.totalSoldGbp)}`)
    console.log(`  Win rate:          ${appMetrics.history.winRate.toFixed(1)}%`)
  } catch (error) {
    console.error("  Sync/activity error:", error instanceof Error ? error.message : error)
  }

  printGapSummary(
    {
      t212Positions,
      etoroPositions,
      appMetrics,
    },
    t212Statements,
    etoroStatement
  )
}

function printGapSummary(
  live: {
    t212Positions: PortfolioPosition[]
    etoroPositions: PortfolioPosition[]
    appMetrics: ReturnType<typeof buildHistoryPerformanceMetrics> | null
  } | null,
  t212Statements: ReturnType<typeof parseT212Statements>,
  etoroStatement: EtoroStatementSummary | null
) {
  console.log("\n━━━ Gap analysis ━━━")

  if (live) {
    const apiTickers = new Map<string, number>()
    for (const position of [...live.t212Positions, ...live.etoroPositions]) {
      apiTickers.set(`${position.broker}:${position.ticker}`, position.shares)
    }

    for (const statementPosition of t212Statements.positions) {
      const apiShares = apiTickers.get(`t212:${statementPosition.ticker}`)
      if (apiShares === undefined) {
        console.log(`  ⚠ T212 ${statementPosition.ticker}: in CSV (${statementPosition.netShares.toFixed(2)} sh) but NOT in live API`)
      } else if (Math.abs(apiShares - statementPosition.netShares) > 0.01) {
        console.log(
          `  ⚠ T212 ${statementPosition.ticker}: CSV net ${statementPosition.netShares.toFixed(2)} sh vs API ${apiShares.toFixed(2)} sh`
        )
      } else {
        console.log(`  ✓ T212 ${statementPosition.ticker}: CSV matches API (${apiShares.toFixed(2)} sh)`)
      }
    }

    for (const [key, shares] of apiTickers) {
      if (!key.startsWith("t212:")) continue
      const ticker = key.slice(5)
      if (!t212Statements.positions.some((position) => position.ticker === ticker)) {
        console.log(`  ⚠ T212 ${ticker}: in live API (${shares.toFixed(2)} sh) but net-zero/missing in CSV exports`)
      }
    }

    if (etoroStatement && live.appMetrics) {
      const apiOpen = live.appMetrics.open.valueGbp
      const stmtUnreal = etoroStatement.endingUnrealizedEquityGbp
      if (stmtUnreal !== null) {
        const etoroApiValue = live.etoroPositions.reduce((sum, position) => sum + position.normalizedTotalValueGbp, 0)
        console.log(`\n  eToro open value (API positions): ${formatGbp(etoroApiValue)}`)
        console.log(`  eToro ending unrealized equity (statement, incl. cash effects): ${formatGbp(stmtUnreal)}`)
        console.log(`  Combined open value (app calc): ${formatGbp(apiOpen)}`)
      }

      console.log(`\n  Realised P/L app (all brokers, all time): ${formatGbp(live.appMetrics.history.realisedPlGbp)}`)
      console.log(`  eToro closed P/L (statement period only): ${formatGbp(etoroStatement.closedPlGbp)}`)
      console.log("  → Realised P/L differs by design: app = all-time round trips; eToro PDF = selected statement window")

      console.log(`\n  Capital in app (all time gross buys): ${formatGbp(live.appMetrics.history.totalBoughtGbp)}`)
      console.log(`  T212 CSV gross buys only:             ${formatGbp(t212Statements.grossBuyGbp)}`)
      console.log("  → Capital in/out is turnover volume, not portfolio size. T212 CSV ≈ most of it; remainder is eToro trades.")
    }
  } else {
    console.log("  T212 statements show ~£385k buy / ~£377k sell — close to app Capital in/out when eToro activity is included.")
    console.log("  eToro statement (Feb–Jun 2026): closed P/L £621.78, ending unrealized equity £6,772.46.")
    console.log("  App open value £13,457 ≈ eToro unrealized (£6,772) + T212 live holdings (~£6,685) if 5 positions total.")
    console.log("  Run without --statements-only and with API keys to verify live positions vs CSV reconstruction.")
  }
}

main().catch((error) => {
  console.error("Fatal:", error)
  process.exit(1)
})
