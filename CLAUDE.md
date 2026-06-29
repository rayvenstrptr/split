# Split Bill (Indonesia)

A client-only web app for splitting a full day of bills across **multiple payers** in
Indonesia. Everyone goes out, different people pay for different stops (lunch, coffee,
dinner, bar), not everyone orders at every stop, and the app compiles **who pays whom**
with the fewest transfers. All money is **Indonesian Rupiah (IDR)**.

There is no *required* backend — state lives in the browser's `localStorage`. An
**optional** cloud sync (Supabase) lets a person carry their sessions across devices
(see **Cloud sync** below).

## Commands

```bash
npm run dev      # Vite dev server (http://localhost:5173 by default; pass --port to change)
npm test         # vitest — the money math in src/lib/settle.ts
npm run build    # tsc --noEmit (typecheck) + vite build
npm run preview  # serve the production build
```

## Deployment

Hosted on **Vercel** as a zero-config Vite static deploy (Vercel auto-detects the framework:
build `vite build`, output `dir` `dist`) — there is **no `vercel.json`**, and don't add one
unless a real need appears. Deploys are **manual one-offs**, not Git-integrated, so a push to
GitHub does **not** redeploy.

- **Project:** `patungan` (Vercel team `rayvenstrptrs-projects`,
  `team_nE7mtSLFiP97RKxNnuA2jOKz`). The local repo is linked via `.vercel/` (untracked;
  `.vercel/project.json` holds the `projectId`).
- **Live URL:** https://patunganku.vercel.app (the bare `patungan*.vercel.app` names were
  already taken globally; Vercel also auto-aliased `patungan-blue.vercel.app`).
- **Ship a new version** (from the repo root, after `vercel login` once):
  ```bash
  vercel deploy --prod        # add --scope rayvenstrptrs-projects if it asks for a scope
  ```
  Vercel builds remotely; verify `npm run build` is green locally first.

By default state is `localStorage`-only, so each visitor gets their **own** data. Two ways to
carry sessions across devices: the in-app **Cloud sync** (optional, Supabase — see below) or
the manual **Backup / restore** JSON (see **Sessions / history**). The static deploy itself is
stateless; all shared data lives in Supabase, not on Vercel.

## Stack

React 18 + TypeScript + Vite 6 + **Tailwind v4** (via the `@tailwindcss/vite` plugin —
there is **no** `tailwind.config.js`/`postcss.config.js`; theme tokens live in
`@theme {}` inside `src/index.css`, e.g. `--color-accent` → the `bg-accent`/`text-accent`
utilities). Light theme only.

Note: typecheck uses a single standalone `tsconfig.json` with `tsc --noEmit` (no project
references / no `tsconfig.node.json`) — keep it that way to avoid `composite` build errors.

## Architecture

All calculation is pure and isolated in `src/lib/settle.ts`; components only render it.

- `src/types.ts` — `Person`, `BillEntry`, `BillItem`, `Bill`, `AppState`, `SavedSession`, `ActivityEvent`.
- `src/lib/settle.ts` — the core. `resolveEntries` (per-person amounts a bill feeds the engine),
  `billShares` (per-bill split), `perPersonSummary`, `netBalances`, `minimizeTransfers`.
  **Covered by `settle.test.ts` — update tests with the logic.**
- `src/lib/money.ts` — `formatIDR`, `groupDigits`, `parseIDR`. All amounts are **integer rupiah**.
- `src/lib/date.ts`, `src/lib/id.ts` — formatting + `uid()` helpers.
- `src/data/sample.ts` — the preloaded R/G/H/K example from the original brief.
- `src/hooks/useLocalStorage.ts` — persisted state.
- `src/hooks/useActivityLog.ts` — the activity/system log (see **Activity log**).
- `src/lib/activity.ts` — pure log helpers: `rotate` (500/250 roll-off), `mergeEvents`, `parseEvents`, `stripForUpload`. **Covered by `activity.test.ts`.**
- `src/lib/cloud.ts` — optional Supabase cloud-sync RPC client (see **Cloud sync**).
- `src/App.tsx` — owns all state + handlers (people, bills, sessions, cloud account, activity log); passes down to panels.
- `src/components/` — `HistoryPanel`, `CloudSyncPanel`, `PeoplePanel`, `BillsPanel` → `BillCard` → `BillItemsEditor`,
  `SettlementPanel`, `ActivityPanel`, `ExportSheet`, `MoneyInput` (shared primitives in `ui.tsx`, palette in `colors.ts`).
  Components are presentational; mutations flow up via callbacks.

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

## Cloud sync (optional)

So a person can carry their sessions across devices without the manual Backup/restore dance,
there's an **opt-in** login: a freely chosen **username + 4-digit PIN**. It's purely additive —
if the Supabase env vars are absent the whole feature is hidden (`cloudConfigured()` in
`src/lib/cloud.ts`) and the app behaves exactly as before.

- **Config:** `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` (the *publishable* `sb_publishable_…`
  key) in `.env.local` for dev, and in the Vercel `patungan` project for the live build (Vite
  inlines `VITE_*` at build time → redeploy after changing them). The account is persisted in
  `localStorage` under `split-bill-id/account/v1` (PIN cached so auto-push is silent).
- **Backend:** Supabase Postgres, schema in `supabase/schema.sql` — one `vaults` table (RLS on,
  no policies → no direct access) plus `claim_vault` / `pull_vault` / `push_vault`
  `SECURITY DEFINER` RPCs that **bcrypt-verify the PIN server-side** (plus the activity-log
  table and its RPCs — see **Activity log**). The browser only holds the public anon key and can
  only EXECUTE those RPCs. A 4-digit PIN is a low-stakes *claim key*, not strong auth (no recovery).
  **Gotcha:** Supabase keeps `pgcrypto` in the `extensions` schema, so the RPCs must
  `set search_path = public, extensions` or `crypt`/`gen_salt` won't resolve.
- **Client:** `src/lib/cloud.ts` calls `/rest/v1/rpc/*` over plain `fetch` (no SDK);
  `src/components/CloudSyncPanel.tsx` is the log-in / create + status UI.
- **Sync model:** Save/Update → debounced **auto-push**, done as a read-merge-write
  (`pull` → `mergeSessions` → `push`) so it never clobbers a newer session from another device.
  **Pull** is automatic on login and manual otherwise (the "Sync now" button) — pulling another
  device's sessions into view is deliberate, so an in-progress edit is never overwritten. Reuses
  `buildBackup` / `parseBackupData` / `mergeSessions` from `backup.ts`. Caveat: merge is
  **union-only**, so deletes don't propagate across devices.

## Activity log

A "system log" of what the user does — add/remove person, add/edit/delete stop, save/load/
delete session, backup/restore, cloud login/logout/create. `App.tsx` handlers call
`log(kind, message, dedupeKey?)` from `useActivityLog`; `message` is **pre-rendered** so the
historical log never drifts as code changes. Edits are **coalesced**: a burst to the same bill
(`dedupeKey = bill.id`) within ~2 min refreshes one "Edited …" row instead of stacking. The
sessions/settle math never logs — this is a UI-side audit trail only.

- **Storage (rolling 500/250 archive):** the active log (`split-bill-id/activity/v1`) holds
  ≤500 events, newest-first. When it fills, `rotate()` moves the oldest **250** into a `pending`
  buffer (`split-bill-id/activity-archive/v1`); rotation runs in a `useActivityLog` effect, so
  `log`/`mergeIn` only ever grow the active list. Nothing is dropped — pending is uploaded to a
  durable server archive.
- **Server archive:** `activity_events` table in `supabase/schema.sql` (RLS on, no policies) —
  the single accumulating store for everything (recent + old), keyed `(username, id)`. Two
  `SECURITY DEFINER` RPCs verify the PIN against `vaults` like the vault RPCs (same
  `search_path` gotcha): `append_activity` (idempotent upsert; coalesced edits update their row)
  and `pull_activity` (paginated, newest-first). **This needs the migration in `schema.sql` to
  be run once.** It does **not** touch the `vaults` data blob — the existing session sync and
  `cloud.test.ts` are unaffected.
- **Sync model:** while logged in, a debounced effect appends new active events (past an
  in-memory `uploadedAt` watermark) **+** all `pending` roll-offs via `appendActivity`, then
  clears the uploaded pending. Failures (incl. the table not existing yet) are swallowed so the
  app keeps working offline — events stay local and retry on the next change. Login / "Sync now"
  also `pullActivity(…500)` → `mergeIn` to show another device's recent events. **Download
  archive** (in `ActivityPanel`) pages the whole server archive, unions local `pending` +
  active, and saves one `{ app, kind:'activity-archive', version, exportedAt, events }` JSON file.
- **Caveats:** **Clear** empties only the local active view; the server archive is append-only
  ("so we can keep") and a later sync re-shows recent events. Until logged in, roll-offs sit in
  the local `pending` buffer (durable in localStorage, included in the archive download).
