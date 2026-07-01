import type { AppState, Bill, BillEntry } from '../types';

export type BillResult = {
  /** Final amount each participant owes for this bill (integer rupiah). */
  perPerson: Record<string, number>;
  subtotal: number; // gross sum of order amounts (before discount)
  discount: number; // discount applied to the subtotal before service & tax
  service: number; // service charge (0 in fromTotal mode)
  tax: number; // restaurant tax (0 in fromTotal mode)
  surcharge: number; // service + tax portion (relative to the discounted subtotal)
  total: number; // what was actually paid / distributed
  effectiveSurchargePct: number; // (total/(subtotal - discount) - 1) * 100
};

/**
 * Split one item's price equally among its owners (integer rupiah). The shares
 * always sum back to `price`: the leftover rupiah land on the first N owners
 * (deterministic by owner order). A zero-price or owner-less item is parked —
 * it contributes nothing to anyone.
 */
function splitItemEqually(price: number, ownerIds: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  const n = ownerIds.length;
  if (n === 0 || price <= 0) return out;
  const base = Math.floor(price / n);
  const remainder = price - base * n; // 0 .. n-1 leftover rupiah
  for (let i = 0; i < n; i++) {
    out[ownerIds[i]] = (out[ownerIds[i]] ?? 0) + base + (i < remainder ? 1 : 0);
  }
  return out;
}

/**
 * Resolve a bill to the per-person order amounts the surcharge engine consumes.
 * `byPerson` (the default) returns the entries verbatim. `byItem` splits each
 * line item equally among its owners and accumulates per person — because every
 * item reconciles to its price, the resolved subtotal equals the sum of item
 * prices, and the existing proportional-surcharge math then applies unchanged.
 */
export function resolveEntries(bill: Bill): BillEntry[] {
  if (bill.splitMode !== 'byItem') return bill.entries;
  const acc: Record<string, number> = {};
  for (const item of bill.items ?? []) {
    const shares = splitItemEqually(Math.max(0, Math.round(item.price)), item.ownerIds);
    for (const [pid, amt] of Object.entries(shares)) acc[pid] = (acc[pid] ?? 0) + amt;
  }
  return Object.entries(acc).map(([personId, amount]) => ({ personId, amount }));
}

/**
 * Compute what each person owes for a single bill.
 *
 * Tax & service are spread proportionally over each person's order amount, so
 * someone who "ordered a lot" carries a bigger slice of the surcharge.
 *
 * - `fromTotal`: we know the amount actually paid; surcharge = total - subtotal.
 * - `fromPercent`: Indonesian receipt order — service is applied to the subtotal
 *   first, then tax is applied on top of (subtotal + service).
 */
export function billShares(bill: Bill): BillResult {
  const entries = resolveEntries(bill);
  const subtotal = entries.reduce((s, e) => s + Math.max(0, e.amount), 0);

  // A discount comes off the subtotal *before* service & tax (Indonesian receipt
  // order: PB1 tax is levied on the post-discount amount). Clamp to [0, subtotal].
  const discount = Math.min(subtotal, Math.max(0, Math.round(bill.discount ?? 0)));
  const netSubtotal = subtotal - discount;

  let service = 0;
  let tax = 0;
  let total: number;

  if (bill.mode === 'fromPercent') {
    const s = (bill.servicePercent ?? 0) / 100;
    const t = (bill.taxPercent ?? 0) / 100;
    service = Math.round(netSubtotal * s);
    tax = Math.round((netSubtotal + service) * t);
    total = netSubtotal + service + tax;
  } else {
    total = Math.max(0, Math.round(bill.total ?? subtotal) - discount);
  }

  const perPerson: Record<string, number> = {};

  if (entries.length > 0) {
    const n = entries.length;
    // Raw proportional share for each entry.
    const raw = entries.map((e) =>
      subtotal > 0 ? (Math.max(0, e.amount) / subtotal) * total : total / n,
    );
    const rounded = raw.map((r) => Math.round(r));

    // Reconcile rounding so the shares sum to `total` exactly: drop the
    // leftover rupiah onto the largest share (deterministic).
    const remainder = total - rounded.reduce((s, r) => s + r, 0);
    if (remainder !== 0) {
      let big = 0;
      for (let i = 1; i < raw.length; i++) if (raw[i] > raw[big]) big = i;
      rounded[big] += remainder;
    }

    entries.forEach((e, i) => {
      perPerson[e.personId] = (perPerson[e.personId] ?? 0) + rounded[i];
    });
  }

  const distributedTotal = Object.values(perPerson).reduce((s, v) => s + v, 0);

  return {
    perPerson,
    subtotal,
    discount,
    service,
    tax,
    surcharge: distributedTotal - netSubtotal,
    total: distributedTotal,
    effectiveSurchargePct:
      netSubtotal > 0 ? (distributedTotal / netSubtotal - 1) * 100 : 0,
  };
}

export type PersonSummary = {
  id: string;
  paid: number; // total this person fronted as payer
  consumed: number; // total of their shares across all bills
  net: number; // paid - consumed; >0 => owed money, <0 => owes
};

/** Per-person paid vs consumed vs net across every bill. */
export function perPersonSummary(state: AppState): PersonSummary[] {
  const paid: Record<string, number> = {};
  const consumed: Record<string, number> = {};
  for (const p of state.people) {
    paid[p.id] = 0;
    consumed[p.id] = 0;
  }

  for (const bill of state.bills) {
    const { perPerson, total } = billShares(bill);
    if (paid[bill.payerId] === undefined) paid[bill.payerId] = 0;
    paid[bill.payerId] += total;
    for (const [id, share] of Object.entries(perPerson)) {
      if (consumed[id] === undefined) consumed[id] = 0;
      consumed[id] += share;
    }
  }

  return state.people.map((p) => ({
    id: p.id,
    paid: paid[p.id] ?? 0,
    consumed: consumed[p.id] ?? 0,
    net: (paid[p.id] ?? 0) - (consumed[p.id] ?? 0),
  }));
}

/** Net balance per person id (>0 creditor, <0 debtor). Sums to zero. */
export function netBalances(state: AppState): Record<string, number> {
  const net: Record<string, number> = {};
  for (const s of perPersonSummary(state)) net[s.id] = s.net;
  return net;
}

export type Transfer = { from: string; to: string; amount: number };

/**
 * Minimize the number of payments: repeatedly settle the largest debtor against
 * the largest creditor. Produces the fewest transfers that clear all balances.
 */
export function minimizeTransfers(net: Record<string, number>): Transfer[] {
  const EPS = 0.5;
  const debtors = Object.entries(net)
    .filter(([, v]) => v < -EPS)
    .map(([id, v]) => ({ id, amt: -v }))
    .sort((a, b) => b.amt - a.amt);
  const creditors = Object.entries(net)
    .filter(([, v]) => v > EPS)
    .map(([id, v]) => ({ id, amt: v }))
    .sort((a, b) => b.amt - a.amt);

  const transfers: Transfer[] = [];
  let i = 0;
  let j = 0;
  while (i < debtors.length && j < creditors.length) {
    const pay = Math.min(debtors[i].amt, creditors[j].amt);
    const amount = Math.round(pay);
    if (amount > 0) {
      transfers.push({ from: debtors[i].id, to: creditors[j].id, amount });
    }
    debtors[i].amt -= pay;
    creditors[j].amt -= pay;
    if (debtors[i].amt <= EPS) i++;
    if (creditors[j].amt <= EPS) j++;
  }
  return transfers;
}

/**
 * Direct settlement: everyone repays exactly the people who fronted money for
 * them, bill by bill, then each pair is netted into a single payment. Unlike
 * `minimizeTransfers`, this preserves the real "who paid for whom" relationships,
 * so a person can both pay and receive (e.g. G → K and K → H).
 */
export function directSettlement(state: AppState): Transfer[] {
  // owe[debtor][creditor] = how much debtor owes creditor before netting.
  const owe: Record<string, Record<string, number>> = {};
  const add = (from: string, to: string, amount: number) => {
    if (from === to || amount <= 0) return;
    (owe[from] ??= {})[to] = (owe[from][to] ?? 0) + amount;
  };

  for (const bill of state.bills) {
    const { perPerson } = billShares(bill);
    for (const [personId, share] of Object.entries(perPerson)) {
      add(personId, bill.payerId, share); // each consumer owes the payer their share
    }
  }

  // Net each unordered pair into one directed transfer (people order = stable output).
  const ids = state.people.map((p) => p.id);
  const transfers: Transfer[] = [];
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const a = ids[i];
      const b = ids[j];
      const diff = Math.round((owe[a]?.[b] ?? 0) - (owe[b]?.[a] ?? 0));
      if (diff > 0) transfers.push({ from: a, to: b, amount: diff });
      else if (diff < 0) transfers.push({ from: b, to: a, amount: -diff });
    }
  }
  return transfers;
}
