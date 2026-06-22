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

- `src/types.ts` — `Person`, `BillEntry`, `BillItem`, `Bill`, `AppState`, `SavedSession`.
- `src/lib/settle.ts` — the core. `resolveEntries` (per-person amounts a bill feeds the engine),
  `billShares` (per-bill split), `perPersonSummary`, `netBalances`, `minimizeTransfers`.
  **Covered by `settle.test.ts` — update tests with the logic.**
- `src/lib/money.ts` — `formatIDR`, `groupDigits`, `parseIDR`. All amounts are **integer rupiah**.
- `src/lib/date.ts`, `src/lib/id.ts` — formatting + `uid()` helpers.
- `src/data/sample.ts` — the preloaded R/G/H/K example from the original brief.
- `src/hooks/useLocalStorage.ts` — persisted state.
- `src/App.tsx` — owns all state + handlers (people, bills, sessions); passes down to panels.
- `src/components/` — `HistoryPanel`, `PeoplePanel`, `BillsPanel` → `BillCard` → `BillItemsEditor`,
  `SettlementPanel`, `MoneyInput`. Components are presentational; mutations flow up via callbacks.

## Domain rules (don't regress these)

- **Money is integer rupiah.** No cents. Parse/format only through `src/lib/money.ts`.
- **Two split modes per bill** (`bill.splitMode`, orthogonal to the surcharge `mode` below):
  - `byPerson` (default; `undefined` for old saved bills) — each person enters their own order
    `amount` in `bill.entries`.
  - `byItem` — `bill.items` are shared line items, each split **equally** among its `ownerIds`
    (a 1-owner item = an individual order; a 0-owner or 0-price item is parked, owed by no one).
  `resolveEntries(bill)` collapses either mode into the `BillEntry[]` the surcharge engine
  consumes, so `billShares` and everything downstream is split-mode-agnostic. Each item
  reconciles to its own price (leftover rupiah land on the first owners), so the resolved
  subtotal equals the sum of item prices.
- **Tax & service are spread proportionally** to each person's order amount (someone who
  "ordered a lot" carries more surcharge). Two modes per bill:
  - `fromTotal` — you know the amount actually paid; surcharge = `total − subtotal`.
    This is the primary mode ("we don't know the %").
  - `fromPercent` — **Indonesian receipt order**: service is applied to the subtotal first,
    then PB1 tax on top of `(subtotal + service)` — so tax compounds on service. Do not
    "simplify" this to `subtotal × (1 + tax + service)`; it would be wrong. Defaults 5% / 10%.
- **Rounding must reconcile:** per-bill shares always sum to the bill total (leftover rupiah
  goes to the largest share), and global `netBalances` always sum to **0**.
- **Settlement is `directSettlement`** — everyone repays exactly the people who fronted money
  for them per bill, then each pair is netted into one payment. This keeps real "who paid for
  whom" chains (a person can both pay and receive, e.g. `G → K` and `K → H`). The numbers are
  locked by the **Bandung** regression test in `settle.test.ts` (`G→K 116417`, `K→H 128791`,
  `R→K 8166`). `minimizeTransfers` (fewest-payments) is kept and tested but **no longer used by
  the UI** — it collapsed those chains, which is not what the user wants.

## Sessions / history

`App.tsx` keeps the current working `AppState` plus a list of named `SavedSession`s, each in
its own `localStorage` key (`split-bill-id/*`). Save updates the loaded session or creates a
new one; snapshots are `structuredClone`d so saved history is independent of later edits.
"New session" keeps the current people but clears bills.

**Backup / restore** (`src/lib/backup.ts`): because `localStorage` can be wiped, sessions can be
exported to a `.json` file and re-imported. Backup file shape:
`{ app:'split-bill-id', kind:'sessions-backup', version, exportedAt, sessions: SavedSession[] }`.
`parseBackup` also accepts a raw `SavedSession[]` array (the format copied straight from
localStorage). `mergeSessions` unions by `id` (newer `savedAt` wins), so re-importing is
idempotent. "Backup all" downloads every session; each row has a `↓` to export just that one.

The working `AppState` is also wrapped in `useUndoableState` (undo/redo, header buttons +
⌘Z/⌘⇧Z); only the present is persisted — undo history is in-memory.
