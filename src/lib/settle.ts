import type { AppState, Bill } from '../types';

export type BillResult = {
  /** Final amount each participant owes for this bill (integer rupiah). */
  perPerson: Record<string, number>;
  subtotal: number; // sum of item amounts
  service: number; // service charge (0 in fromTotal mode)
  tax: number; // restaurant tax (0 in fromTotal mode)
  surcharge: number; // total - subtotal (service + tax, however composed)
  total: number; // what was actually paid / distributed
  effectiveSurchargePct: number; // (total/subtotal - 1) * 100
};

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
  const entries = bill.entries;
  const subtotal = entries.reduce((s, e) => s + Math.max(0, e.amount), 0);

  let service = 0;
  let tax = 0;
  let total: number;

  if (bill.mode === 'fromPercent') {
    const s = (bill.servicePercent ?? 0) / 100;
    const t = (bill.taxPercent ?? 0) / 100;
    service = Math.round(subtotal * s);
    tax = Math.round((subtotal + service) * t);
    total = subtotal + service + tax;
  } else {
    total = Math.round(bill.total ?? subtotal);
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
    service,
    tax,
    surcharge: distributedTotal - subtotal,
    total: distributedTotal,
    effectiveSurchargePct: subtotal > 0 ? (distributedTotal / subtotal - 1) * 100 : 0,
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
