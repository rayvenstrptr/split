# Split Bill (Indonesia)

A client-only web app for splitting a full day of bills across **multiple payers** in
Indonesia. Everyone goes out, different people pay for different stops (lunch, coffee,
dinner, bar), not everyone orders at every stop, and the app compiles **who pays whom**
with the fewest transfers. All money is **Indonesian Rupiah (IDR)**.

There is no backend — state lives in the browser's `localStorage`.

## Commands

```bash
npm run dev      # Vite dev server (http://localhost:5173 by default; pass --port to change)
npm test         # vitest — the money math in src/lib/settle.ts
npm run build    # tsc --noEmit (typecheck) + vite build
npm run preview  # serve the production build
```

## Stack

React 18 + TypeScript + Vite 6 + **Tailwind v4** (via the `@tailwindcss/vite` plugin —
there is **no** `tailwind.config.js`/`postcss.config.js`; theme tokens live in
`@theme {}` inside `src/index.css`, e.g. `--color-accent` → the `bg-accent`/`text-accent`
utilities). Light theme only.

Note: typecheck uses a single standalone `tsconfig.json` with `tsc --noEmit` (no project
references / no `tsconfig.node.json`) — keep it that way to avoid `composite` build errors.

## Architecture

All calculation is pure and isolated in `src/lib/settle.ts`; components only render it.

- `src/types.ts` — `Person`, `BillEntry`, `Bill`, `AppState`, `SavedSession`.
- `src/lib/settle.ts` — the core. `billShares` (per-bill split), `perPersonSummary`,
  `netBalances`, `minimizeTransfers`. **Covered by `settle.test.ts` — update tests with the logic.**
- `src/lib/money.ts` — `formatIDR`, `groupDigits`, `parseIDR`. All amounts are **integer rupiah**.
- `src/lib/date.ts`, `src/lib/id.ts` — formatting + `uid()` helpers.
- `src/data/sample.ts` — the preloaded R/G/H/K example from the original brief.
- `src/hooks/useLocalStorage.ts` — persisted state.
- `src/App.tsx` — owns all state + handlers (people, bills, sessions); passes down to panels.
- `src/components/` — `HistoryPanel`, `PeoplePanel`, `BillsPanel` → `BillCard`,
  `SettlementPanel`, `MoneyInput`. Components are presentational; mutations flow up via callbacks.

## Domain rules (don't regress these)

- **Money is integer rupiah.** No cents. Parse/format only through `src/lib/money.ts`.
- **Tax & service are spread proportionally** to each person's order amount (someone who
  "ordered a lot" carries more surcharge). Two modes per bill:
  - `fromTotal` — you know the amount actually paid; surcharge = `total − subtotal`.
    This is the primary mode ("we don't know the %").
  - `fromPercent` — **Indonesian receipt order**: service is applied to the subtotal first,
    then PB1 tax on top of `(subtotal + service)` — so tax compounds on service. Do not
    "simplify" this to `subtotal × (1 + tax + service)`; it would be wrong. Defaults 5% / 10%.
- **Rounding must reconcile:** per-bill shares always sum to the bill total (leftover rupiah
  goes to the largest share), and global `netBalances` always sum to **0**.
- **Settlement** uses a greedy largest-debtor/largest-creditor match (`minimizeTransfers`) —
  Splitwise-style "simplify debts".

## Sessions / history

`App.tsx` keeps the current working `AppState` plus a list of named `SavedSession`s, each in
its own `localStorage` key (`split-bill-id/*`). Save updates the loaded session or creates a
new one; snapshots are `structuredClone`d so saved history is independent of later edits.
"New session" keeps the current people but clears bills.
