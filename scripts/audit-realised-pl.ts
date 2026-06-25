/**
 * Audit realised P/L: broker-reported sell P/L vs app trade-cycle logic vs CSV.
 *
 * Usage:
 *   T212_API_KEY=... T212_API_SECRET=... ETORO_API_KEY=... ETORO_API_SECRET=... \
 *     npx tsx scripts/audit-realised-pl.ts
 */

import { readFileSync, readdirSync, existsSync } from "node:fs"
import { join, resolve } from "node:path"
import {
  buildTradeCycles,
  groupTradeCyclesByBroker,
  sumClosedCycleRealisedPlGbp,
} from "@/lib/dashboard/trade-cycles"
import { buildHistoryTradeMetrics } from "@/lib/dashboard/history-metrics"
import { fetchEtoroSyncDataFromApi } from "@/lib/integrations/etoro-live"
import { fetchTrading212SyncDataFromApi } from "@/lib/integrations/trading212-live"
import type { PortfolioActivityEvent } from "@/types/portfolio"

const STATEMENTS_DIR = resolve(process.cwd(), "statements")

function formatGbp(value: number) {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(value)
}

function isSell(event: PortfolioActivityEvent) {
  if (event.broker === "etoro" && event.orderType === "Close") return true
  return event.type === "sell"
}

function sumBrokerReportedSellPl(activity: PortfolioActivityEvent[]) {
  let total = 0
  let withBroker = 0
  let withoutBroker = 0
  const missing: PortfolioActivityEvent[] = []

  for (const event of activity) {
    if (!isSell(event)) continue
    if (event.realisedProfitGbp !== undefined) {
      total += event.realisedProfitGbp
      withBroker += 1
    } else {
      withoutBroker += 1
      missing.push(event)
    }
  }

  return { total, withBroker, withoutBroker, missing }
}

function sumFifoFallbackPl(activity: PortfolioActivityEvent[]) {
  const cycles = buildTradeCycles(activity).filter((cycle) => cycle.sell && cycle.plGbp !== null)
  let fifoOnly = 0
  let brokerField = 0

  for (const cycle of cycles) {
    const sell = cycle.sell!
    if (sell.realisedProfitGbp !== undefined) {
      brokerField += cycle.plGbp ?? 0
    } else {
      fifoOnly += cycle.plGbp ?? 0
    }
  }

  return { fifoOnly, brokerField, cycleCount: cycles.length }
}

function parseT212CsvResultSum(dir: string) {
  let total = 0
  let sells = 0
  for (const file of readdirSync(dir).filter((name) => name.startsWith("from_") && name.endsWith(".csv"))) {
    const lines = readFileSync(join(dir, file), "utf8").trim().split(/\r?\n/)
    const headers = lines[0]!.split(",")
    const actionIdx = headers.indexOf("Action")
    const resultIdx = headers.indexOf("Result")
    for (const line of lines.slice(1)) {
      if (!line.includes("sell")) continue
      const cols = line.match(/(".*?"|[^,]+)/g)?.map((c) => c.replace(/^"|"$/g, "")) ?? []
      if (!cols[actionIdx]?.toLowerCase().includes("sell")) continue
      sells += 1
      const result = cols[resultIdx]?.trim()
      if (result) total += Number.parseFloat(result)
    }
  }
  return { total, sells }
}

async function main() {
  const t212 = {
    apiKey: process.env.T212_API_KEY?.trim() ?? "",
    apiSecret: process.env.T212_API_SECRET?.trim() ?? "",
  }
  const etoro = {
    apiKey: process.env.ETORO_API_KEY?.trim() ?? "",
    apiSecret: process.env.ETORO_API_SECRET?.trim() ?? "",
  }

  if (!t212.apiKey || !t212.apiSecret || !etoro.apiKey || !etoro.apiSecret) {
    console.error("Set T212_* and ETORO_* env vars")
    process.exit(1)
  }

  console.log("Fetching live activity from both brokers...\n")
  const [t212Sync, etoroSync] = await Promise.all([
    fetchTrading212SyncDataFromApi(t212),
    fetchEtoroSyncDataFromApi(etoro),
  ])

  const byBroker = {
    t212: t212Sync.activity,
    etoro: etoroSync.activity,
  }
  const allActivity = [...t212Sync.activity, ...etoroSync.activity]

  console.log("━━━ Activity counts ━━━")
  console.log(`  T212 events: ${t212Sync.activity.length}`)
  console.log(`  eToro events: ${etoroSync.activity.length}`)
  console.log(`  T212 sells: ${t212Sync.activity.filter(isSell).length}`)
  console.log(`  eToro closes: ${etoroSync.activity.filter(isSell).length}`)

  console.log("\n━━━ Realised P/L comparison (the key audit) ━━━")
  console.log("  Method A = sum of broker-reported P/L on each sell/close leg (ground truth from API fields)")
  console.log("  Method B = app trade-cycle logic (buildTradeCycles → sum plGbp)")
  console.log("  Method C = T212 CSV 'Result' column (T212 only, from exported statements)\n")

  for (const [broker, activity] of Object.entries(byBroker) as Array<["t212" | "etoro", PortfolioActivityEvent[]]>) {
    const brokerReported = sumBrokerReportedSellPl(activity)
    const cycles = buildTradeCycles(activity)
    const closedCycles = cycles.filter((c) => c.sell && c.plGbp !== null)
    const cycleSum = closedCycles.reduce((sum, c) => sum + (c.plGbp ?? 0), 0)
    const fallback = sumFifoFallbackPl(activity)
    const winning = closedCycles.filter((c) => (c.plGbp ?? 0) > 0).length

    console.log(`  ${broker.toUpperCase()}`)
    console.log(`    Method A (broker sell P/L sum):  ${formatGbp(brokerReported.total)}  (${brokerReported.withBroker} sells with P/L, ${brokerReported.withoutBroker} without)`)
    console.log(`    Method B (trade cycles):         ${formatGbp(cycleSum)}  (${closedCycles.length} closed cycles, win rate ${closedCycles.length ? ((winning / closedCycles.length) * 100).toFixed(1) : 0}%)`)
    console.log(`      └ from broker field on sells:  ${formatGbp(fallback.brokerField)}`)
    console.log(`      └ from FIFO fallback:          ${formatGbp(fallback.fifoOnly)}`)
    console.log(`    A vs B delta:                    ${formatGbp(brokerReported.total - cycleSum)}`)

    if (brokerReported.withoutBroker > 0) {
      console.log(`    ⚠ ${brokerReported.withoutBroker} sells missing broker P/L — app uses FIFO for these:`)
      for (const event of brokerReported.missing.slice(0, 5)) {
        console.log(`      ${event.timestamp.slice(0, 10)} ${event.ticker} ${event.shares} sh ${formatGbp(event.grossAmountGbp)}`)
      }
    }

    if (Math.abs(brokerReported.total - cycleSum) > 0.02) {
      console.log("    ⚠ MISMATCH between broker-reported sum and cycle sum — cycle logic bug")
      for (const cycle of closedCycles) {
        const sell = cycle.sell!
        if (sell.realisedProfitGbp !== undefined && Math.abs((cycle.plGbp ?? 0) - sell.realisedProfitGbp) > 0.02) {
          console.log(`      cycle ${sell.ticker} ${sell.timestamp.slice(0, 10)}: cycle=${formatGbp(cycle.plGbp ?? 0)} sell field=${formatGbp(sell.realisedProfitGbp)}`)
        }
      }
    } else {
      console.log("    ✓ Cycle sum matches broker-reported sell P/L")
    }
    console.log()
  }

  const allBrokerReported = sumBrokerReportedSellPl(allActivity)
  const allCycleSum = sumClosedCycleRealisedPlGbp(allActivity)
  const historyMetrics = buildHistoryTradeMetrics(allActivity)

  console.log("  COMBINED (both brokers)")
  console.log(`    Method A (broker sell P/L sum):  ${formatGbp(allBrokerReported.total)}`)
  console.log(`    Method B (trade cycles / app):   ${formatGbp(allCycleSum)}`)
  console.log(`    buildHistoryTradeMetrics:        ${formatGbp(historyMetrics.realisedPlGbp)} (${historyMetrics.closedTradeCount} cycles, ${historyMetrics.winRate.toFixed(1)}% win rate)`)
  console.log(`    A vs B delta:                    ${formatGbp(allBrokerReported.total - allCycleSum)}`)

  if (existsSync(STATEMENTS_DIR)) {
    const csv = parseT212CsvResultSum(STATEMENTS_DIR)
    const t212Broker = sumBrokerReportedSellPl(t212Sync.activity)
    console.log("\n━━━ T212 CSV vs T212 API ━━━")
    console.log(`  CSV Result column sum:     ${formatGbp(csv.total)} (${csv.sells} sells)`)
    console.log(`  T212 API sell P/L sum:     ${formatGbp(t212Broker.total)} (${t212Broker.withBroker} sells with P/L field)`)
    console.log(`  Delta (CSV − API):         ${formatGbp(csv.total - t212Broker.total)}`)
    if (Math.abs(csv.total - t212Broker.total) > 5) {
      console.log("  ⚠ CSV and API disagree — likely missing trades in CSV export date range or FX rounding")
    }
  }

  console.log("\n━━━ eToro position-id pairing check ━━━")
  const etoroSells = etoroSync.activity.filter(isSell)
  const etoroBuys = etoroSync.activity.filter((e) => e.broker === "etoro" && e.orderType === "Open")
  for (const sell of etoroSells) {
    const positionKey = sell.id.split(":")[1] ?? "?"
    const matchingBuy = etoroBuys.find((b) => b.id.split(":")[1] === positionKey)
    const cycle = buildTradeCycles([matchingBuy, sell].filter(Boolean) as PortfolioActivityEvent[])[0]
    console.log(
      `  ${sell.ticker} close ${sell.timestamp.slice(0, 10)} id-key=${positionKey} ` +
        `sellP/L=${sell.realisedProfitGbp !== undefined ? formatGbp(sell.realisedProfitGbp) : "missing"} ` +
        `paired=${matchingBuy ? "yes" : "NO"}`
    )
  }

  console.log("\n━━━ Interpretation ━━━")
  if (Math.abs(allBrokerReported.total - allCycleSum) < 0.05) {
    console.log("  App cycle math is consistent with broker-reported sell P/L fields.")
    console.log("  If dashboard still looks wrong, the issue is in API field mapping or missing history rows — not FIFO/cycles.")
  } else {
    console.log("  App cycle math diverges from broker sell P/L — investigate trade-cycles.ts pairing.")
  }
}

main().catch((error) => {
  console.error("Fatal:", error)
  process.exit(1)
})
