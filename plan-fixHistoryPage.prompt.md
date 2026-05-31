# Fix History Page — API Integration & Enhanced Analytics UI

## Status: ✅ IMPLEMENTED

The history page had two categories of problems: (1) API-synced data bugs (Trading 212 `grossAmountGbp` missing FX conversion, eToro GBX/pence prices showing as USD), and (2) the history UI was too basic — it lacked at-a-glance insights like top gainers/losers, per-stock P&L breakdown, and intuitive filtering. CSV import is out of scope.

## Completed Steps

1. ✅ **Fixed `grossAmountGbp` FX conversion in Trading 212 live API mapper** — `trading212-live.ts` now multiplies USD amounts by `USD_TO_GBP_FALLBACK_RATE` (0.79).

2. ✅ **Verified eToro GBX/pence handling** — `etoro-live.ts` already correctly detects GBX via `getEtoroCurrencyInfo`, sets `priceScale: "gbx"`, divides by 100 via `normalizeEtoroPrice`, and sets currency to `"GBP"`.

3. ✅ **Enhanced history page with top gainers/losers** — New cards showing top 5 gainers, top 5 losers, and most-traded tickers.

4. ✅ **Improved filtering UX** — Added quick-filter chips ("Biggest trades", "Most traded", "Profitable only", "Loss-making only") and a view toggle between "All trades" table and "By ticker summary" aggregation.

5. ✅ **Added analytics insights panel** — Win rate, best/worst single trade, net flow, active days, and monthly investment cadence chart.

6. ✅ **Integration tests** — Created `src/lib/integrations/__tests__/trading212-live.test.ts` and `etoro-live.test.ts` with vitest. All 6 tests pass.

## Further Considerations

1. The fallback FX rate (`0.79`) is hardcoded in multiple files — consider extracting to a shared `USD_TO_GBP_FALLBACK_RATE` constant in a single module and importing it everywhere.
2. For the "top gainers/losers" feature, eToro's trade history API returns both `openRate` and `closeRate` per position, enabling true P&L calculation per closed trade. Trading 212's `/equity/history/orders` provides `fillPrice` but not explicit close data — the UI should clarify which broker supports full P&L vs. activity-only view.
3. Consider adding a toggle for currency display (show in native currency vs. normalised GBP) on the history page, consistent with the main dashboard's `CurrencyMode`.
