# Split Bill (Indonesia)

A client-only web app for splitting a full day of bills across **multiple payers** in
Indonesia. Everyone goes out, different people pay for different stops (lunch, coffee,
dinner, bar), not everyone orders at every stop, and the app compiles **who pays whom**
(real "who fronted for whom" chains — see `directSettlement`). All money is **Indonesian Rupiah (IDR)**.

There is no backend — state lives in the browser's `localStorage`.

## Commands

```bash
npm run dev      # Vite dev server (http://localhost:5173 by default; pass --port to change)
npm test         # vitest — settle.ts (money math) + cloud.ts
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

The app is a thin shell (`src/App.tsx`) with a slide-out `Sidebar` that switches between two
mini-apps: **Split Bill** (`SplitBillApp`) and **Spin Wheel** (`SpinWheelApp`). The shell owns
what must outlive the app switch — the saved `history` sessions and the cloud account — so the
login can sit in the shared sidebar. Bill calculation stays pure in `src/lib/settle.ts`;
components only render it.

- `src/types.ts` — `Person`, `BillEntry`, `BillItem`, `Bill`, `AppState`, `SavedSession`, `WheelName`.
- `src/lib/settle.ts` — the core. `resolveEntries` (per-person amounts a bill feeds the engine),
  `billShares` (per-bill split), `perPersonSummary`, `netBalances`, `directSettlement`,
  `minimizeTransfers`. **Covered by `settle.test.ts` — update tests with the logic.**
- `src/lib/money.ts` — `formatIDR`, `groupDigits`, `parseIDR`. All amounts are **integer rupiah**.
- `src/lib/cloud.ts` — optional Supabase sync (see "Cloud sync"). **Covered by `cloud.test.ts`.**
- `src/lib/backup.ts` — session export/import; `mergeSessions` (shared by backup + cloud sync).
- `src/lib/date.ts`, `src/lib/id.ts`, `src/lib/colors.ts`, `src/lib/reorder.ts` — small helpers.
- `src/data/sample.ts` — the preloaded R/G/H/K example from the original brief.
- `src/hooks/useLocalStorage.ts` (+ `readStored`/`writeStored`), `src/hooks/useUndoableState.ts`.
- `src/App.tsx` — shell: app switch, sidebar, cloud account, `history`; debounced auto-push on edit.
- `src/components/SplitBillApp.tsx` — the split screen; owns the working `AppState` (people, bills)
  via `useUndoableState`. Renders `HistoryPanel`, `PeoplePanel`, `BillsPanel` → `BillCard` →
  `BillItemsEditor`, `SettlementPanel`, and the header `ExportModal` (which wraps `ExportSheet`).
  Also owns the `settlementMode` toggle (`direct` | `minimize`). The working state lives at
  `WORKING_STATE_KEY` (exported, so the Spin Wheel can import people from it).
- `src/components/SpinWheelApp.tsx` → `SpinWheel` — random name picker; the textarea text is the
  source of truth and the wheel's names are derived from it (independent of bills).
- `src/components/` shared: `Sidebar`, `CloudSyncPanel`, `MoneyInput`, `ReorderableList`,
  `ui.tsx` (`Button`, `SectionHead`, `ConfirmDialog`, …). Components are presentational;
  mutations flow up via callbacks.

## Cloud sync (optional)

`src/lib/cloud.ts` talks to Supabase Postgres RPCs (`claim_vault`/`pull_vault`/`push_vault`) over
**plain `fetch`** — there is **no** `@supabase/supabase-js` dependency. Auth is a username +
4-digit PIN checked server-side inside the RPCs (the shipped anon key is safe). Config is two env
vars, `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (see `.env.example` / `.env.local`);
`cloudConfigured()` gates the whole sync UI, so the app runs fully offline when they're unset.
Sync is read-merge-write via `mergeSessions`, so a push never clobbers a newer session from
another device. See the `cloud-sync-supabase` memory for the project ref + schema gotchas.

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
- **Discount is optional and applied _before_ tax & service** (`bill.discount`, integer rupiah):
  it lowers the subtotal first, so `fromPercent` charges service/tax on the discounted amount
  (Indonesian receipt order — PB1 tax is levied on the post-discount total). In `fromTotal` it
  simply subtracts from the entered total. Clamped to `[0, subtotal]`. A bill with no tax/service
  and no discount collapses its footer to a single **Total** line.
- **Rounding must reconcile:** per-bill shares always sum to the bill total (leftover rupiah
  goes to the largest share), and global `netBalances` always sum to **0**.
- **Settlement is a user choice** (the "Who pays whom" toggle in `SettlementPanel`; persisted in
  `split-bill-id/settlement-mode/v1`, default `direct`):
  - `directSettlement` (**default**) — everyone repays exactly the people who fronted money for
    them per bill, then each pair is netted into one payment. Keeps real "who paid for whom" chains
    (a person can both pay and receive, e.g. `G → K` and `K → H`). Locked by the **Bandung**
    regression test in `settle.test.ts` (`G→K 116417`, `K→H 128791`, `R→K 8166`).
  - `minimizeTransfers` ("Simplified") — the fewest payments that still settle everyone; it
    collapses those chains. Also kept and tested. The hero count, `SettlementPanel`, and the
    exported receipt all follow the toggle.

## Sessions / history

`SplitBillApp` keeps the current working `AppState`; the named `SavedSession` list lives one
level up in `App` (so the sidebar login can share it for cloud sync). State persists across
versioned `localStorage` keys (`split-bill-id/*/v1`). Save updates the loaded session or creates a
new one; snapshots are `structuredClone`d so saved history is independent of later edits.
"New session" resets to a clean slate — it clears both people and bills.

**Receipt export** (`src/components/ExportModal.tsx` → `ExportSheet.tsx`): a header **Share**
button opens a modal that copies a text summary or downloads the (monochrome-only) receipt as PNG
(`html-to-image`) or PDF (`jspdf`) — the app's only two runtime deps. The sheet honours the current
`settlementMode`. (Link sharing is teased in the modal but not built yet.)

**Backup / restore** (`src/lib/backup.ts`): because `localStorage` can be wiped, sessions can be
exported to a `.json` file and re-imported. Backup file shape:
`{ app:'split-bill-id', kind:'sessions-backup', version, exportedAt, sessions: SavedSession[] }`.
`parseBackup` also accepts a raw `SavedSession[]` array (the format copied straight from
localStorage). `mergeSessions` unions by `id` (newer `savedAt` wins), so re-importing is
idempotent. "Backup all" downloads every session; each row has a `↓` to export just that one.

The working `AppState` is also wrapped in `useUndoableState` (undo/redo, header buttons +
⌘Z/⌘⇧Z); only the present is persisted — undo history is in-memory.
