export type Person = {
  id: string;
  name: string; // initial or short name, e.g. "R"
};

export type BillEntry = {
  personId: string;
  amount: number; // integer rupiah — this person's own order subtotal
};

/** A shared line item (item-based bill): price splits equally among its owners. */
export type BillItem = {
  id: string;
  name: string; // "Movie tickets", "Fries"
  price: number; // integer rupiah — the line-item price (pre-surcharge)
  ownerIds: string[]; // people who share this item equally
};

export type SurchargeMode = 'fromTotal' | 'fromPercent';

/**
 * How a bill's per-person subtotals are derived.
 * - `byPerson` (default): each person enters their own order amount.
 * - `byItem`: line items are assigned to owners and split equally.
 * Orthogonal to `SurchargeMode` — either split mode still supports both surcharge modes.
 */
export type BillSplitMode = 'byPerson' | 'byItem';

export type Bill = {
  id: string;
  name: string; // "Lunch", "Coffee", ...
  payerId: string; // who fronted the money
  entries: BillEntry[]; // only the people who ordered at this stop
  mode: SurchargeMode;
  total?: number; // mode 'fromTotal': actual amount paid
  servicePercent?: number; // mode 'fromPercent': applied to subtotal first
  taxPercent?: number; // mode 'fromPercent': applied to (subtotal + service)
  splitMode?: BillSplitMode; // undefined === 'byPerson' (back-compat)
  items?: BillItem[]; // splitMode 'byItem': shared line items
};

export type AppState = {
  people: Person[];
  bills: Bill[];
};

/** A named, saved snapshot of a whole day's split (the history feature). */
export type SavedSession = {
  id: string;
  name: string;
  savedAt: number; // epoch ms
  state: AppState;
};

/** What an {@link ActivityEvent} is about — drives the colored dot in the panel. */
export type ActivityKind =
  | 'session'
  | 'bill'
  | 'person'
  | 'cloud'
  | 'backup'
  | 'edit'
  | 'system';

/**
 * One entry in the activity log. `message` is pre-rendered so the historical log
 * never drifts as code changes. `dedupeKey` is a local-only coalescing hint (e.g.
 * a bill id) and is dropped before the event is uploaded.
 */
export type ActivityEvent = {
  id: string; // uid('a_')
  at: number; // epoch ms
  kind: ActivityKind;
  message: string;
  dedupeKey?: string;
};
