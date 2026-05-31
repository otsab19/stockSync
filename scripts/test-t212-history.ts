/**
 * Test script: Fetch Trading 212 history and log raw API responses.
 *
 * Usage:
 *   node --experimental-strip-types scripts/test-t212-history.ts <API_KEY> <API_SECRET>
 *
 * Or with env vars:
 *   T212_API_KEY=your_key T212_API_SECRET=your_secret node --experimental-strip-types scripts/test-t212-history.ts
 */

const API_KEY = process.argv[2] || process.env.T212_API_KEY || ""
const API_SECRET = process.argv[3] || process.env.T212_API_SECRET || ""
const BASE_URL = process.env.T212_BASE_URL || "https://live.trading212.com/api/v0"

if (!API_KEY || !API_SECRET) {
  console.error("❌ Set T212_API_KEY and T212_API_SECRET environment variables")
  process.exit(1)
}

function buildAuth(apiKey: string, apiSecret: string) {
  return `Basic ${Buffer.from(`${apiKey}:${apiSecret}`, "utf8").toString("base64")}`
}

async function fetchJson(path: string) {
  const url = `${BASE_URL}${path}`
  console.log(`\n→ GET ${url}`)
  const response = await fetch(url, {
    method: "GET",
    headers: {
      Accept: "application/json",
      Authorization: buildAuth(API_KEY, API_SECRET),
    },
  })

  console.log(`  Status: ${response.status} ${response.statusText}`)
  console.log(`  Rate-limit remaining: ${response.headers.get("x-ratelimit-remaining")}`)
  console.log(`  Rate-limit reset: ${response.headers.get("x-ratelimit-reset")}`)

  const text = await response.text()

  if (!response.ok) {
    console.error(`  ❌ Error body: ${text.slice(0, 500)}`)
    return null
  }

  try {
    return JSON.parse(text)
  } catch {
    console.error(`  ❌ Not JSON: ${text.slice(0, 200)}`)
    return null
  }
}

async function main() {
  console.log("=== Trading 212 API Test ===")
  console.log(`Base URL: ${BASE_URL}`)
  console.log(`API Key: ${API_KEY.slice(0, 6)}...`)

  // Step 1: Test positions endpoint
  console.log("\n\n━━━ STEP 1: Fetch positions ━━━")
  const positions = await fetchJson("/equity/positions")
  if (positions) {
    if (Array.isArray(positions)) {
      console.log(`  ✅ Got ${positions.length} positions`)
      if (positions[0]) {
        console.log(`  Sample position keys: ${Object.keys(positions[0]).join(", ")}`)
        console.log(`  Sample position:`, JSON.stringify(positions[0], null, 2))
      }
    } else {
      console.log(`  Response type: ${typeof positions}`)
      console.log(`  Keys: ${Object.keys(positions).join(", ")}`)
      console.log(`  Full response:`, JSON.stringify(positions, null, 2).slice(0, 1000))
    }
  }

  // Step 2: Test history/orders endpoint (first page only)
  console.log("\n\n━━━ STEP 2: Fetch history/orders (page 1) ━━━")
  const history = await fetchJson("/equity/history/orders?limit=5")
  if (history) {
    console.log(`  Response keys: ${Object.keys(history).join(", ")}`)
    const items = history.items ?? history.data ?? (Array.isArray(history) ? history : [])
    console.log(`  Items count: ${items.length}`)
    console.log(`  nextPagePath: ${history.nextPagePath ?? "null"}`)

    if (items[0]) {
      console.log(`\n  Sample order keys: ${Object.keys(items[0]).join(", ")}`)
      console.log(`  Sample order:`, JSON.stringify(items[0], null, 2))
    }
    if (items[1]) {
      console.log(`\n  Second order:`, JSON.stringify(items[1], null, 2))
    }
  }

  // Step 3: Test account summary
  console.log("\n\n━━━ STEP 3: Account summary ━━━")
  const summary = await fetchJson("/equity/account/summary")
  if (summary) {
    console.log(`  Response:`, JSON.stringify(summary, null, 2))
  }

  console.log("\n\n=== Done ===")
}

main().catch((err) => {
  console.error("Fatal error:", err)
  process.exit(1)
})

