# StockSync

StockSync is a Next.js 16 app intended to import portfolio data from Trading 212, eToro, and later brokers using direct APIs or transaction-history CSV files, unify those holdings in one dashboard, and monitor positions for roughly ±£25 alert thresholds.

At the moment, this repository is **closer to a scaffold / prototype than a finished working product**. The app builds, but several parts are incomplete or only mocked.

## Current status

### Verified on this repository

The following checks were run locally against the current codebase:

```bash
npm run lint
npm run build
curl -i http://localhost:3000/
curl -i http://localhost:3000/dashboard
curl -i http://localhost:3000/integrations
curl -i http://localhost:3000/settings
curl -i http://localhost:3000/api/portfolio
curl -i -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/check-alerts
```

### What works

- `npm run lint` passes.
- `npm run build` passes once the active Next 16 config keeps an explicit `turbopack: {}` alongside the PWA plugin.
- `/`, `/dashboard`, `/integrations`, and `/settings` render.
- The project structure is valid for a Next.js App Router app.
- Missing infrastructure now surfaces as explicit setup states instead of crashing the app.
- Trading 212 CSV files can now be imported manually from the app in browser mode.
- Trading 212 can now also be refreshed in browser mode from a locally entered API key + API secret pair, with that credential pair optionally stored only in the current browser for later manual refreshes.
- eToro CSV files can now be imported manually from the app in browser mode.
- The dashboard now supports manual refresh and optional client-side polling for repository reloads.
- Browser-mode imports are now broker-aware, so Trading 212 and eToro can coexist in one unified local portfolio instead of overwriting each other.
- The Supabase schema and API surface now include a server-backed broker sync scaffold for future periodic refresh.

### What does not work yet

1. **The app is not self-contained**
   - `src/utils/supabase/server.ts` and `src/utils/supabase/client.ts` require Supabase environment variables.
   - Without them, the app no longer crashes; the API returns a `setup_required` response and the dashboard explains what is missing.

2. **The selected backend controls app behavior**
   - `NEXT_PUBLIC_DATA_BACKEND=supabase`
     - uses server/client adapters that read portfolio state through Supabase
    - `NEXT_PUBLIC_DATA_BACKEND=browser`
      - uses browser-local IndexedDB portfolio storage on the current device
     - does not require Supabase for dashboard portfolio data

3. **Broker imports are still only partially implemented**
   - Trading 212 and eToro are represented behind provider interfaces so more platforms can be added later.
    - Trading 212 now supports browser-local CSV import and a browser-testing API key + secret sync from inside `/integrations`.
   - eToro now supports browser-local CSV import from inside `/integrations`, but direct API ingestion is not implemented yet.

4. **Auth is not implemented in the UI for Supabase mode**
   - The dashboard can explain that sign-in is required, but there is no sign-in screen or session bootstrap yet.

5. **Alerts are scaffolded rather than complete**
   - `src/app/api/cron/check-alerts/route.ts` uses a backend-specific alert job adapter.
   - In browser mode it returns a successful skipped response because there is no server-owned pipeline to send background notifications after the app is closed.
   - In Supabase mode it validates cron auth, Supabase connectivity, and VAPID configuration as the basis for server-backed ±£25 notifications.

6. **Database setup is still manual**
   - The repository defines expected Supabase tables in `src/types/supabase.ts`.
   - The repository now includes an initial Supabase CLI migration in `supabase/migrations/`, but you still need to apply it to your project.

7. **Push notifications are only partially wired**
   - The service worker and manifest now point to real icon assets.
   - Frontend subscription registration and the production notification flow are still missing.
   - Browser-only mode can support in-app alert UX while the app is open, but not closed-app background push delivery without a backend service.

## Backend selection

The app now uses a small adapter/factory layer so backend choice happens once instead of through scattered `if` checks.

Set this in `.env.local`:

```bash
NEXT_PUBLIC_DATA_BACKEND=supabase
```

or:

```bash
NEXT_PUBLIC_DATA_BACKEND=browser
```

### Backend modes

#### `supabase`

- dashboard loads data through the server portfolio adapter
- `/api/portfolio` is active
- `/api/cron/check-alerts` is active
- requires Supabase env vars
- broker API keys are read from `public.profiles`
- intended home for persisted snapshots and background push delivery when the app is closed
- intended home for future periodic broker API sync jobs

#### `browser`

- dashboard loads portfolio data from browser-local IndexedDB on the current device
- no Supabase setup is required for portfolio viewing
- `/api/portfolio` returns a `client_only` informational response if called directly on the server
- `/api/cron/check-alerts` returns a successful skipped response because browser mode does not use server-owned alert processing
- portfolio data is local to the browser and not shared across devices
- Trading 212 API credentials can be stored locally in IndexedDB on the current device for browser-only testing, and dashboard refresh can use them to re-sync the Trading 212 slice while the app is open
- alerts can be surfaced while the app is open, but background push notifications after the app is closed are not possible in this mode
- the currently implemented real data paths are Trading 212 browser API key + secret sync plus manual Trading 212 and eToro CSV uploads from `/integrations`

## Where the app gets your data right now

### Implemented today

- **Trading 212 manual CSV import from inside the app**
  - available on `/integrations`
  - replaces only the Trading 212 slice of browser-local IndexedDB
  - drives the dashboard and alert badges in browser mode
- **Trading 212 browser API key + secret sync from inside the app**
  - available on `/integrations`
  - fetches live holdings through the local Next.js route and writes them into browser-local IndexedDB
  - can remember the API key + secret pair only in the current browser so dashboard refresh can re-sync while the app is open
- **eToro manual CSV import from inside the app**
  - available on `/integrations`
  - replaces only the eToro slice of browser-local IndexedDB
  - drives the dashboard and alert badges in browser mode

These imported broker slices are combined into one unified browser-local portfolio for the dashboard.

### Not implemented yet

- **eToro direct API sync**
- **real server-side scheduled broker sync jobs**

The current provider entry points are:

- `src/lib/integrations/trading212.ts`
- `src/lib/integrations/etoro.ts`

Those files are where real API clients should be added. Right now they do not contain real Trading 212 or eToro API integration logic.

The current sync scaffold is exposed through:

- `src/app/api/sync/status/route.ts`
- `src/lib/sync/`

It reports broker connection and sync-run state for the future server-backed integration path.

## Manual vs periodic refresh

### Manual from the app

- You can manually sync Trading 212 data from an API key + secret pair or import Trading 212 CSV data from `/integrations` in browser mode.
- You can manually import eToro CSV data from `/integrations` in browser mode.
- You can manually refresh the dashboard from `/dashboard` using the refresh button.
- Re-importing one broker replaces only that broker's holdings; other imported brokers stay in place.

### Periodic refresh

- The dashboard now supports optional client-side polling to re-read the selected repository at an interval.
- This is useful for reloading browser-local imported data or re-fetching server responses while the app is open.
- **Closed-app periodic broker sync and push notifications still require the Supabase/server-backed mode.**

### What periodic broker sync should mean long-term

For the product direction you described, the intended flow is:

1. user connects Trading 212 and/or eToro
2. server-backed jobs periodically sync portfolio positions and snapshots
3. alert evaluation compares live P/L to the ±£25 threshold
4. push notifications are sent even when the app is closed

That long-term flow is not fully implemented yet.

## Server-backed sync scaffold

The codebase now includes a concrete server-owned sync model for the Supabase mode, even though real broker APIs are still pending.

### Tables added to the schema model

- `broker_connections`
  - stores which brokers are connected
  - stores source type (`manual_csv` or future `broker_api`)
  - stores sync mode (`manual` or `scheduled`)
  - stores last sync status / timestamp / last error
- `sync_runs`
  - stores each sync attempt
  - stores trigger type (`manual` or `scheduled`)
  - stores imported position count and failure information

### API route

- `GET /api/sync/status`
  - in browser mode, returns a disabled response explaining that periodic sync is server-owned
  - in Supabase mode, returns current broker connections and recent sync runs when configured and authenticated
  - acts as the app-facing status surface for future scheduled broker refresh

## Tech stack

- Next.js 16.2.6
- React 19.2.4
- TypeScript
- Tailwind CSS 4
- Supabase SSR + Supabase JS
- `@ducanh2912/next-pwa`
- `web-push`
- Recharts
- Shadcn-style UI components

## Project structure

```text
src/
  app/
    api/
      cron/check-alerts/route.ts
      portfolio/route.ts
    dashboard/page.tsx
    integrations/page.tsx
    settings/page.tsx
    layout.tsx
    page.tsx
  components/ui/
  lib/utils.ts
  lib/backend/config.ts
  lib/integrations/
    etoro.ts
    factory.ts
    provider.ts
    trading212.ts
  lib/alerts/
    factory.ts
    repository.ts
    supabase-alert-job.ts
    unsupported-alert-job.ts
  lib/portfolio/
    browser-indexeddb.ts
    client-factory.ts
    factory.ts
    http-api.ts
    repository.ts
    server-factory.ts
    server-supabase.ts
    server-unsupported.ts
  types/portfolio.ts
  types/alerts.ts
  types/supabase.ts
  utils/supabase/
    client.ts
    server.ts
public/
  icons/
  manifest.json
  sw.js
supabase/
  config.toml
  migrations/
    20260530193000_initial_schema.sql
  seed.sql
next.config.mjs
.env.browser.example
.env.example
.env.supabase.example
```

## Environment variables

Create a local env file at `.env.local`.

```bash
NEXT_PUBLIC_DATA_BACKEND=supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
CRON_SECRET=
NEXT_PUBLIC_VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
```

### What each variable is used for

- `NEXT_PUBLIC_DATA_BACKEND`
  - selects `supabase` or `browser`
  - controls which portfolio/alert adapters are created
- `NEXT_PUBLIC_SUPABASE_URL`
  - Required when `NEXT_PUBLIC_DATA_BACKEND=supabase`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - Required when `NEXT_PUBLIC_DATA_BACKEND=supabase`
- `CRON_SECRET`
  - Required by `GET /api/cron/check-alerts` in Supabase mode
- `NEXT_PUBLIC_VAPID_PUBLIC_KEY`
  - Required for push subscription / web push setup in Supabase mode
- `VAPID_PRIVATE_KEY`
  - Required for sending push notifications from the server in Supabase mode

### Trading 212 and eToro API keys

These are **not** stored in `.env.local`.

This app currently expects broker API keys to be stored per-user in the `public.profiles` table:

- `t212_api_key`
- `etoro_api_key`

That behavior comes directly from `src/app/api/portfolio/route.ts`, which loads broker keys from the authenticated user's profile row.

Longer-term, CSV transaction-history import can coexist with this credential-based path, but today the implemented browser data flows are Trading 212 API key + secret sync plus Trading 212 and eToro CSV imports.

Do **not** put real broker API keys in:

- `.env.local`
- `.env.browser.example`
- `.env.supabase.example`
- `supabase/seed.sql`
- committed SQL fixtures

### Environment templates

Use the mode-specific templates:

- `.env.browser.example`
  - minimal browser mode using IndexedDB
- `.env.supabase.example`
  - Supabase mode with server-backed APIs and alerts

## Database expectations

From `src/types/supabase.ts`, the app expects these Supabase tables in the `public` schema:

### `profiles`

- `id`
- `t212_api_key`
- `etoro_api_key`
- `created_at`

### `push_subscriptions`

- `id`
- `user_id`
- `endpoint`
- `p256dh`
- `auth`
- `created_at`

### `portfolio_snapshots`

- `id`
- `user_id`
- `ticker`
- `broker`
- `current_pl_gbp`
- `last_alerted_pl`
- `updated_at`

### `broker_connections`

- `id`
- `user_id`
- `broker`
- `source_type`
- `sync_mode`
- `sync_status`
- `is_enabled`
- `last_synced_at`
- `last_error`
- `created_at`
- `updated_at`

### `sync_runs`

- `id`
- `user_id`
- `connection_id`
- `broker`
- `trigger`
- `source_type`
- `status`
- `positions_imported`
- `error_message`
- `started_at`
- `finished_at`

> Note: this repo includes TypeScript table types, Supabase CLI migrations, and a safe placeholder seed file. You still need to apply the schema to your actual Supabase project.

The repository now includes an initial migration file for Supabase CLI:

- `supabase/migrations/20260530193000_initial_schema.sql`
- `supabase/config.toml`
- `supabase/seed.sql`

It creates:

- `public.profiles`
- `public.push_subscriptions`
- `public.portfolio_snapshots`
- RLS policies for per-user access
- an `auth.users` trigger to auto-create a `profiles` row

The included `supabase/seed.sql` is intentionally a no-op placeholder with comments only.
That is deliberate so no real Trading 212 or eToro secrets are ever normalized into source control.

## Local development

Install dependencies:

```bash
npm install
```

Run the dev server:

```bash
npm run dev
```

Run lint:

```bash
npm run lint
```

Run a production build:

```bash
npm run build
```

Create your local env file from one of the examples:

```bash
cp .env.browser.example .env.local
```

or:

```bash
cp .env.supabase.example .env.local
```

For browser-local mode, the minimum useful config is:

```bash
NEXT_PUBLIC_DATA_BACKEND=browser
```

Browser mode stores portfolio data in IndexedDB on the current device.
It is useful for local portfolio viewing, and it can now test Trading 212 API key + secret refresh locally in the browser. It still cannot deliver background notifications once the app is closed because there is no server-owned alert worker in that mode.

For Supabase mode, set:

```bash
NEXT_PUBLIC_DATA_BACKEND=supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
CRON_SECRET=
NEXT_PUBLIC_VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
```

If you are using Supabase CLI, apply the included migration after linking your project:

```bash
supabase db push
```

For local Supabase CLI development, a typical flow is:

```bash
supabase start
supabase db reset
```

Notes:

- `supabase/config.toml` enables `supabase/seed.sql` during resets
- `supabase/seed.sql` is currently safe and intentionally empty of secrets
- `public.profiles` rows should normally be created by the auth trigger in the migration
- broker API keys should be added later through app UI or manual per-user updates in Supabase

## Routes

### Pages

- `/`
  - project landing page with quick links and setup notes
- `/dashboard`
  - portfolio dashboard UI for imported/live holdings with explicit loading, setup-required, unauthorized, client-only, error, and empty states
- `/integrations`
  - broker integration roadmap page showing the planned API and CSV import structure, including the working Trading 212 and eToro browser CSV importers
- `/settings`
  - local setup checklist page

### API routes

- `GET /api/portfolio`
  - in Supabase mode, returns structured JSON states: `ok`, `setup_required`, `unauthorized`, or `error`
  - in browser mode, returns `client_only`
  - currently returns mocked portfolio rows through provider abstractions when broker API keys are present in `profiles`
- `GET /api/sync/status`
  - in browser mode, returns an informational disabled response because periodic broker sync is server-owned
  - in Supabase mode, returns broker connection and recent sync-run status when available
  - forms the current app-facing scaffold for future scheduled broker sync
- `GET /api/cron/check-alerts`
  - in Supabase mode, requires `Authorization: Bearer <CRON_SECRET>`
  - in browser mode, returns `200` with a skipped result
  - currently acts as a scaffold endpoint for future server-backed ±£25 alert processing

Example cron request:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/check-alerts
```

## Why the project feels "broken"

The project started as a scaffold with missing routes, weak failure handling, and undocumented infrastructure dependencies. The local-development experience is now much better, but the underlying product integrations are still incomplete.

The biggest blockers are:

1. No documented real auth flow / sign-in UI for Supabase mode
2. Dashboard data is still mocked regardless of backend
3. Trading 212 and eToro browser CSV imports are implemented, and a server sync scaffold exists, but live APIs and real scheduled broker sync are still missing
3. Trading 212 browser API key + secret sync and Trading 212/eToro browser CSV imports are implemented, but eToro live API sync and real scheduled broker sync are still missing
4. Alert processing is scaffolded rather than complete
5. Supabase schema must still be applied to your actual project environment for Supabase mode
6. Browser mode is IndexedDB-based, device-local only, and cannot send background notifications after the app is closed
7. Push subscription UX is still missing

## What needs to be done next

### Priority 1: Make the app runnable locally

- [x] Add a `.env.example`
- [x] Document backend and Supabase project setup clearly
- [x] Add SQL migrations or a schema setup guide
- [x] Handle missing Supabase configuration gracefully instead of crashing
- [x] Make `/api/portfolio` return a safe response when unauthenticated

### Priority 1b: Backend abstraction

- [x] Add an env-driven backend selector
- [x] Add adapter/factory layers instead of scattering backend conditionals
- [x] Support browser-local IndexedDB portfolio storage
- [x] Return explicit client-only / skipped responses for server-owned features in browser mode

### Priority 2: Fix broken UX paths

- [x] Replace the starter homepage in `src/app/page.tsx`
- [x] Implement `src/app/integrations/page.tsx`
- [x] Implement `src/app/settings/page.tsx`
- [x] Add empty/error states on the dashboard instead of perpetual loading / invalid data assumptions

### Priority 3: Clean up code quality issues

- [x] Fix ESLint errors in the Next config
- [x] Replace `any` types in `src/app/dashboard/page.tsx`
- [x] Replace `any` types in `src/app/api/cron/check-alerts/route.ts`
- [x] Add proper response typing for API routes

### Priority 4: Complete product functionality

- [ ] Implement real Trading 212 integration
- [ ] Implement real eToro integration
- [ ] Add CSV import support for brokers beyond the current Trading 212 and eToro browser importers
- [ ] Add user authentication screens
- [ ] Add push subscription registration flow in the frontend
- [ ] Replace mock alert calculations with real portfolio change tracking
- [ ] Add tests for API routes and dashboard data handling

### Priority 5: Finish PWA support

- [x] Add missing icon files referenced by `public/manifest.json`
- [ ] Verify service worker registration behavior
- [ ] Test installability and push notification flow end-to-end

## Recommended immediate fixes

If you want the fastest path to a usable prototype, do these first:

1. Choose a backend by setting `NEXT_PUBLIC_DATA_BACKEND`
2. If using Supabase mode, add `.env.local` credentials and run `supabase db push`
3. Add a simple auth flow so the dashboard can move beyond the `unauthorized` state in Supabase mode
4. Replace mocked broker responses with real integrations and/or CSV imports
5. Implement frontend push subscription registration
6. Add UI to let each user save their Trading 212 and eToro API keys into `public.profiles`

## Current answer to "where is my data coming from?"

- In **browser mode**, if you imported a Trading 212 or eToro CSV from `/integrations`, the dashboard is reading that imported dataset from IndexedDB.
- In **browser mode**, if you saved a Trading 212 API key + secret pair on `/integrations`, the dashboard refresh button can re-sync that Trading 212 slice from the API into IndexedDB while the app is open.
- In **browser mode**, imports are merged at broker level, so Trading 212 and eToro holdings can appear together in the same dashboard.
- In **browser mode** with no manual import, the dashboard falls back to bundled sample data.
- In **Supabase mode**, the app currently reads from the server-side provider layer, but those providers still need real Trading 212 and eToro API implementations.

So today, the real user-owned data paths implemented in the app are the manual Trading 212 and eToro CSV workflows.

## Notes

- The project is using Next.js 16, so behavior and conventions may differ from older Next.js examples.
- The current app is a solid starting scaffold, but it still needs backend setup, route completion, and production hardening before it can be considered working.
