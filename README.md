# StockSync

A Next.js 16 portfolio aggregator that imports and unifies holdings from Trading 212 and eToro via live API sync or CSV import, presenting them in a single dashboard with ±£25 alert thresholds and push notifications.

## Features

- **Multi-broker portfolio dashboard** — unified view of Trading 212 + eToro holdings with KPI strip, charts, and filterable table
- **Live API sync** — Trading 212 (API key + secret) and eToro (API key + user key) real-time portfolio and trade history fetching
- **CSV import** — manual import of Trading 212 transaction exports and eToro account statement CSVs
- **Trade history** — `/dashboard/history` page showing activity events from both brokers
- **Ticker normalization** — automatic cleaning of eToro LSE suffixes (e.g. `RRl` → `RR`) and known renames (e.g. `GIG` → `BBAI`)
- **GBX/pence detection** — heuristic detection of London-listed instruments priced in pence, with automatic conversion to GBP
- **Alert system** — ±£25 P&L threshold monitoring with push notification scaffold
- **PWA support** — installable with service worker and web push subscription
- **Dual backend modes** — Supabase (server-backed) or browser-local (IndexedDB)

## Tech stack

- Next.js 16.2.6 / React 19.2.4 / TypeScript
- Tailwind CSS 4
- Supabase SSR + Supabase JS
- Pino (structured logging)
- Recharts (charts)
- Framer Motion (animations)
- Vitest (testing)
- `@ducanh2912/next-pwa`
- `web-push`

## Quick start

```bash
npm install
cp .env.browser.example .env.local   # or .env.supabase.example
npm run dev
```

## Backend modes

Set `NEXT_PUBLIC_DATA_BACKEND` in `.env.local`:

### `browser`

- Portfolio data stored in browser-local IndexedDB
- No Supabase required for portfolio viewing
- Trading 212 and eToro API sync works via local Next.js API routes
- CSV imports available from `/integrations`
- Cannot deliver background push notifications when app is closed

### `supabase`

- Server-backed portfolio storage and sync
- Broker API credentials stored encrypted in `api_secrets` table
- `/api/cron/check-alerts` for scheduled alert processing
- Push notifications for closed-app alert delivery
- Requires Supabase environment variables

## Environment variables

```bash
NEXT_PUBLIC_DATA_BACKEND=browser       # or supabase
NEXT_PUBLIC_SUPABASE_URL=              # required for supabase mode
NEXT_PUBLIC_SUPABASE_ANON_KEY=         # required for supabase mode
SUPABASE_SERVICE_ROLE_KEY=             # required for cron jobs to read/write server-side sync tables
CRON_SECRET=                           # required for /api/cron/check-alerts
NEXT_PUBLIC_VAPID_PUBLIC_KEY=          # required for push notifications
VAPID_PRIVATE_KEY=                     # required for push notifications

# eToro API configuration (optional overrides)
ETORO_API_BASE_URL=                    # defaults to https://public-api.etoro.com
ETORO_ACCOUNT_MODE=                    # "real" (default) or "demo"
ETORO_PORTFOLIO_PATHS=                 # comma-separated custom paths

# Trading 212 API configuration (optional override)
TRADING212_API_BASE_URL=               # defaults to https://live.trading212.com/api/v0
```

Broker API keys are stored per-user (in `api_secrets` table for Supabase mode, or browser IndexedDB for browser mode). **Never put real broker keys in `.env.local` or committed files.**

## Project structure

```text
src/
  app/
    api/
      credentials/route.ts       — save/retrieve broker API keys
      cron/check-alerts/         — scheduled alert processing
      integrations/sync-from-api/ — broker API sync endpoint
      portfolio/route.ts         — portfolio data endpoint
      push/                      — push subscription management
      sync/                      — sync status endpoint
    auth/callback/               — OAuth callback
    dashboard/
      page.tsx                   — main portfolio dashboard
      history/page.tsx           — trade history page
    integrations/page.tsx        — broker connection & CSV import UI
    login/page.tsx               — login page
    settings/page.tsx            — settings & setup checklist
  components/
    dashboard/                   — filter bar, KPI strip, charts, table, navigation
    integrations/                — broker-specific sync and CSV import cards
    notifications/               — push notification UI components
    ui/                          — shared UI primitives (button, card, dialog, table, badge)
  lib/
    alerts/                      — alert threshold logic, factory, repository
    backend/                     — config, structured logger
    dashboard/                   — filter engine, portfolio response helpers
    integrations/
      etoro.ts                   — eToro provider facade
      etoro-csv.ts               — eToro CSV parser
      etoro-live.ts              — eToro live API client (portfolio + trade history)
      trading212.ts              — Trading 212 provider facade
      trading212-csv.ts          — Trading 212 CSV parser
      trading212-live.ts         — Trading 212 live API client (portfolio + history)
      factory.ts                 — broker provider factory
      provider.ts                — provider interface
    notifications/               — push subscription hook
    portfolio/                   — position normalizer, repositories, adapters
    sync/                        — sync job logic
  types/                         — TypeScript type definitions
  utils/supabase/                — Supabase client/server helpers
supabase/
  config.toml
  migrations/
    20260530193000_initial_schema.sql
    20260531120000_add_api_secrets.sql
    20260531140000_add_positions_activity_tables.sql
  seed.sql
```

## Routes

### Pages

| Route | Description |
|-------|-------------|
| `/` | Landing page |
| `/login` | Sign-in page |
| `/dashboard` | Portfolio dashboard with KPIs, charts, and positions table |
| `/dashboard/history` | Trade history / activity events |
| `/integrations` | Broker connections, API sync, and CSV import |
| `/settings` | Setup checklist and configuration |

### API routes

| Route | Description |
|-------|-------------|
| `GET /api/portfolio` | Portfolio data (server mode) or `client_only` (browser mode) |
| `POST /api/integrations/sync-from-api` | Trigger live broker API sync |
| `GET /api/sync/status` | Broker connection and sync-run status |
| `GET/POST /api/credentials` | Save/retrieve encrypted broker API keys |
| `GET /api/cron/check-alerts` | Scheduled alert evaluation (requires `CRON_SECRET`) |
| `POST /api/push` | Push subscription management |

## Broker integrations

### Trading 212

- **Live API sync**: fetches current positions and full order history (all pages, rate-limited at 6 req/min)
- **CSV import**: parses Trading 212 transaction export files
- Ticker cleaning: strips `_US_EQ`, `_EQ`, `_GB_EQ`, `p_EQ` suffixes
- Wallet impact: uses `walletImpact.netValue` for GBP gross amounts when available

### eToro

- **Live API sync**: fetches portfolio positions and up to 5 years of trade history
- **CSV import**: parses eToro account statement CSVs
- Instrument enrichment: fetches metadata and live rates for all instruments
- Ticker cleaning: strips LSE suffixes (`.L`, `.LON`), trailing lowercase `l`, applies rename aliases
- GBX detection: identifies pence-priced instruments via exchange info, currency codes, and live rate magnitude (>200)
- Leveraged positions: correctly accounts for leverage in share/amount calculations

## Database schema

Applied via Supabase CLI migrations:

- `profiles` — user profiles with auth trigger
- `api_secrets` — encrypted broker API credentials per user
- `push_subscriptions` — web push subscription endpoints
- `portfolio_snapshots` — P&L tracking for alert evaluation
- `broker_connections` — broker connection state and sync status
- `sync_runs` — sync attempt history
- `positions` — persisted portfolio positions
- `activity_events` — persisted trade history
- `llm_analyses` — locally generated LLM/Ollama stock analysis results
- `llm_analysis_targets` — tickers queued as source input for local LLM analysis workers

## Development

```bash
npm run dev          # dev server
npm run build        # production build
npm run lint         # ESLint
npm run test         # Vitest
npm run test:watch   # Vitest watch mode
```

For Supabase local development:

```bash
supabase start
supabase db reset    # applies migrations + seed
```

## Deployment

Deploy the Next.js app to Vercel and set the required environment variables in the Vercel project settings.

For closed-app alert delivery, use cron-job.org to call the secured alert endpoint on a schedule:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" https://your-app.vercel.app/api/cron/check-alerts
```

Recommended cron-job.org settings:

- **URL**: `https://your-app.vercel.app/api/cron/check-alerts`
- **Method**: `GET`
- **Schedule**: every 15 minutes
- **Request header**: `Authorization: Bearer <your CRON_SECRET value>`
- **Expected status**: `200`
