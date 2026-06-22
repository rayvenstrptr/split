import { describe, it, expect } from 'vitest';
import type { AppState, Bill } from '../types';
import {
  billShares,
  netBalances,
  minimizeTransfers,
  directSettlement,
  perPersonSummary,
  resolveEntries,
} from './settle';
import type { BillEntry } from '../types';

const bill = (b: Partial<Bill> & Pick<Bill, 'payerId' | 'entries'>): Bill => ({
  id: Math.random().toString(36).slice(2),
  name: 'Bill',
  mode: 'fromTotal',
  ...b,
});

describe('billShares — proportional surcharge from total', () => {
  it('scales each order by total/subtotal (the Bar example)', () => {
    const r = billShares(
      bill({
        payerId: 'G',
        total: 600_000,
        entries: [
          { personId: 'R', amount: 50_000 },
          { personId: 'G', amount: 300_000 },
          { personId: 'H', amount: 80_000 },
          { personId: 'K', amount: 70_000 },
        ],
      }),
    );
    expect(r.subtotal).toBe(500_000);
    expect(r.total).toBe(600_000);
    expect(r.surcharge).toBe(100_000);
    expect(r.effectiveSurchargePct).toBeCloseTo(20);
    expect(r.perPerson).toEqual({ R: 60_000, G: 360_000, H: 96_000, K: 84_000 });
    const sum = Object.values(r.perPerson).reduce((s, v) => s + v, 0);
    expect(sum).toBe(600_000);
  });
});

describe('billShares — percent mode uses Indonesian compounding order', () => {
  it('applies service to subtotal, then tax on (subtotal + service)', () => {
    const r = billShares(
      bill({
        payerId: 'R',
        mode: 'fromPercent',
        servicePercent: 5,
        taxPercent: 10,
        entries: [
          { personId: 'R', amount: 250_000 },
          { personId: 'G', amount: 250_000 },
        ],
      }),
    );
    expect(r.subtotal).toBe(500_000);
    expect(r.service).toBe(25_000); // 5% of 500k
    expect(r.tax).toBe(52_500); // 10% of 525k, not 10% of 500k
    expect(r.total).toBe(577_500);
  });
});

describe('billShares — rounding always reconciles to the total', () => {
  it('never loses or invents rupiah on awkward splits', () => {
    const r = billShares(
      bill({
        payerId: 'A',
        total: 100_000,
        entries: [
          { personId: 'A', amount: 1 },
          { personId: 'B', amount: 1 },
          { personId: 'C', amount: 1 },
        ],
      }),
    );
    const sum = Object.values(r.perPerson).reduce((s, v) => s + v, 0);
    expect(sum).toBe(100_000);
  });

  it('equal-splits when there are no item amounts (subtotal 0)', () => {
    const r = billShares(
      bill({
        payerId: 'A',
        total: 90_000,
        entries: [
          { personId: 'A', amount: 0 },
          { personId: 'B', amount: 0 },
          { personId: 'C', amount: 0 },
        ],
      }),
    );
    expect(r.perPerson).toEqual({ A: 30_000, B: 30_000, C: 30_000 });
  });
});

describe('multi-bill settlement (the full R/G/H/K day)', () => {
  const state: AppState = {
    people: [
      { id: 'R', name: 'R' },
      { id: 'G', name: 'G' },
      { id: 'H', name: 'H' },
      { id: 'K', name: 'K' },
    ],
    bills: [
      // Lunch — R paid, H did not order
      bill({
        name: 'Lunch',
        payerId: 'R',
        total: 300_000,
        entries: [
          { personId: 'R', amount: 100_000 },
          { personId: 'G', amount: 100_000 },
          { personId: 'K', amount: 100_000 },
        ],
      }),
      // Coffee — H paid, everyone
      bill({
        name: 'Coffee',
        payerId: 'H',
        total: 120_000,
        entries: [
          { personId: 'R', amount: 30_000 },
          { personId: 'G', amount: 30_000 },
          { personId: 'H', amount: 30_000 },
          { personId: 'K', amount: 30_000 },
        ],
      }),
      // Dinner — K paid, G did not order
      bill({
        name: 'Dinner',
        payerId: 'K',
        total: 300_000,
        entries: [
          { personId: 'R', amount: 100_000 },
          { personId: 'H', amount: 100_000 },
          { personId: 'K', amount: 100_000 },
        ],
      }),
      // Bar — G paid, everyone
      bill({
        name: 'Bar',
        payerId: 'G',
        total: 400_000,
        entries: [
          { personId: 'R', amount: 100_000 },
          { personId: 'G', amount: 100_000 },
          { personId: 'H', amount: 100_000 },
          { personId: 'K', amount: 100_000 },
        ],
      }),
    ],
  };

  it('computes correct net balances that sum to zero', () => {
    const net = netBalances(state);
    expect(net).toEqual({ R: -30_000, G: 170_000, H: -110_000, K: -30_000 });
    const sum = Object.values(net).reduce((s, v) => s + v, 0);
    expect(sum).toBe(0);
  });

  it('paid and consumed totals reconcile per person', () => {
    const summary = perPersonSummary(state);
    const byId = Object.fromEntries(summary.map((s) => [s.id, s]));
    expect(byId.G.paid).toBe(400_000);
    expect(byId.G.consumed).toBe(230_000);
    expect(byId.G.net).toBe(170_000);
    const totalPaid = summary.reduce((s, p) => s + p.paid, 0);
    const totalConsumed = summary.reduce((s, p) => s + p.consumed, 0);
    expect(totalPaid).toBe(totalConsumed);
  });

  it('settles everyone with minimal transfers, all flowing to G', () => {
    const transfers = minimizeTransfers(netBalances(state));
    // Three debtors, one creditor => exactly three transfers, all to G.
    expect(transfers).toHaveLength(3);
    expect(transfers.every((t) => t.to === 'G')).toBe(true);
    const received = transfers.reduce((s, t) => s + t.amount, 0);
    expect(received).toBe(170_000);
    const owed: Record<string, number> = { R: 30_000, H: 110_000, K: 30_000 };
    for (const t of transfers) expect(t.amount).toBe(owed[t.from]);
  });
});

describe('directSettlement — real Bandung session (who paid for whom)', () => {
  const state: AppState = {
    people: [
      { id: 'R', name: 'R' },
      { id: 'G', name: 'G' },
      { id: 'H', name: 'H' },
      { id: 'K', name: 'K' },
    ],
    bills: [
      bill({
        name: 'BMB',
        payerId: 'K',
        total: 324_500,
        entries: [
          { personId: 'R', amount: 105_833 },
          { personId: 'G', amount: 105_833 },
          { personId: 'K', amount: 83_333 },
        ],
      }),
      bill({
        name: 'Swike Karang Anyar',
        payerId: 'R',
        total: 320_000,
        entries: [
          { personId: 'R', amount: 80_000 },
          { personId: 'G', amount: 80_000 },
          { personId: 'H', amount: 80_000 },
          { personId: 'K', amount: 80_000 },
        ],
      }),
      bill({
        name: 'Point Coffee Pagi',
        payerId: 'H',
        total: 75_000,
        entries: [
          { personId: 'R', amount: 25_000 },
          { personId: 'H', amount: 25_000 },
          { personId: 'K', amount: 25_000 },
        ],
      }),
      bill({
        name: 'Bakmi Bakso Anugerah',
        payerId: 'R',
        total: 213_000,
        entries: [
          { personId: 'R', amount: 53_250 },
          { personId: 'G', amount: 53_250 },
          { personId: 'H', amount: 53_250 },
          { personId: 'K', amount: 53_250 },
        ],
      }),
      bill({
        name: 'Sejiwa',
        payerId: 'H',
        total: 142_065,
        entries: [
          { personId: 'R', amount: 30_000 },
          { personId: 'G', amount: 16_500 },
          { personId: 'H', amount: 46_500 },
          { personId: 'K', amount: 30_000 },
        ],
      }),
      bill({
        name: 'Dapoer Pandan Wangi',
        payerId: 'H',
        total: 350_900,
        entries: [
          { personId: 'R', amount: 81_583 },
          { personId: 'G', amount: 81_583 },
          { personId: 'H', amount: 70_250 },
          { personId: 'K', amount: 85_583 },
        ],
      }),
      bill({
        name: 'Point Coffee Malem',
        payerId: 'K',
        total: 75_000,
        entries: [
          { personId: 'R', amount: 25_000 },
          { personId: 'H', amount: 25_000 },
          { personId: 'K', amount: 25_000 },
        ],
      }),
    ],
  };

  const find = (from: string, to: string) =>
    directSettlement(state).find((t) => t.from === from && t.to === to);

  it('matches the hand-verified transfers', () => {
    expect(find('G', 'K')?.amount).toBe(116_417);
    expect(find('K', 'H')?.amount).toBe(128_791);
    expect(find('R', 'K')?.amount).toBe(8_166);
  });

  it('every transfer reconciles each person to their net balance', () => {
    const transfers = directSettlement(state);
    for (const s of perPersonSummary(state)) {
      const out = transfers
        .filter((t) => t.from === s.id)
        .reduce((a, t) => a + t.amount, 0);
      const inc = transfers
        .filter((t) => t.to === s.id)
        .reduce((a, t) => a + t.amount, 0);
      expect(inc - out).toBe(s.net);
    }
  });
});

const toMap = (entries: BillEntry[]): Record<string, number> =>
  Object.fromEntries(entries.map((e) => [e.personId, e.amount]));

describe('resolveEntries — item splitting', () => {
  it('splits a shared item equally among its owners', () => {
    const entries = resolveEntries(
      bill({
        payerId: 'R',
        entries: [],
        splitMode: 'byItem',
        items: [
          { id: 'i1', name: 'Fries', price: 100_000, ownerIds: ['R', 'G', 'H', 'K'] },
        ],
      }),
    );
    expect(toMap(entries)).toEqual({ R: 25_000, G: 25_000, H: 25_000, K: 25_000 });
    expect(entries.reduce((s, e) => s + e.amount, 0)).toBe(100_000);
  });

  it('reconciles an uneven split: leftover rupiah land on the first owners', () => {
    const entries = resolveEntries(
      bill({
        payerId: 'A',
        entries: [],
        splitMode: 'byItem',
        items: [
          { id: 'i1', name: 'Pitcher', price: 100_000, ownerIds: ['A', 'B', 'C'] },
        ],
      }),
    );
    expect(toMap(entries)).toEqual({ A: 33_334, B: 33_333, C: 33_333 });
    expect(entries.reduce((s, e) => s + e.amount, 0)).toBe(100_000);
  });

  it('treats a single-owner item as that person ordering it alone', () => {
    const entries = resolveEntries(
      bill({
        payerId: 'R',
        entries: [],
        splitMode: 'byItem',
        items: [{ id: 'i1', name: 'Steak', price: 50_000, ownerIds: ['G'] }],
      }),
    );
    expect(toMap(entries)).toEqual({ G: 50_000 });
  });

  it('accumulates a person across multiple overlapping items', () => {
    const entries = resolveEntries(
      bill({
        payerId: 'R',
        entries: [],
        splitMode: 'byItem',
        items: [
          { id: 'i1', name: 'Tickets', price: 120_000, ownerIds: ['R', 'G'] },
          { id: 'i2', name: 'Fries', price: 80_000, ownerIds: ['R', 'G', 'H', 'K'] },
        ],
      }),
    );
    expect(toMap(entries)).toEqual({ R: 80_000, G: 80_000, H: 20_000, K: 20_000 });
    expect(entries.reduce((s, e) => s + e.amount, 0)).toBe(200_000);
  });

  it('ignores owner-less and zero-price items', () => {
    const entries = resolveEntries(
      bill({
        payerId: 'R',
        entries: [],
        splitMode: 'byItem',
        items: [
          { id: 'i1', name: 'Unassigned', price: 50_000, ownerIds: [] },
          { id: 'i2', name: 'Free water', price: 0, ownerIds: ['R'] },
        ],
      }),
    );
    expect(entries).toEqual([]);
  });

  it('returns the verbatim entries for person-based bills (back-compat)', () => {
    const b = bill({
      payerId: 'R',
      entries: [
        { personId: 'R', amount: 50_000 },
        { personId: 'G', amount: 70_000 },
      ],
    });
    expect(resolveEntries(b)).toBe(b.entries);
  });
});

describe('billShares — item-based bills carry surcharge proportionally', () => {
  it('fromPercent: item subtotals feed the Indonesian compounding order', () => {
    const r = billShares(
      bill({
        payerId: 'R',
        mode: 'fromPercent',
        servicePercent: 5,
        taxPercent: 10,
        entries: [],
        splitMode: 'byItem',
        items: [
          { id: 'i1', name: 'Pitcher', price: 300_000, ownerIds: ['R', 'G', 'H'] },
          { id: 'i2', name: 'Tickets', price: 200_000, ownerIds: ['R', 'G'] },
        ],
      }),
    );
    expect(r.subtotal).toBe(500_000);
    expect(r.service).toBe(25_000); // 5% of 500k
    expect(r.tax).toBe(52_500); // 10% of 525k
    expect(r.total).toBe(577_500);
    expect(r.perPerson).toEqual({ R: 231_000, G: 231_000, H: 115_500 });
    const sum = Object.values(r.perPerson).reduce((s, v) => s + v, 0);
    expect(sum).toBe(r.total);
  });

  it('fromTotal: shares always reconcile to the awkward total', () => {
    const r = billShares(
      bill({
        payerId: 'A',
        total: 200_001,
        entries: [],
        splitMode: 'byItem',
        items: [
          { id: 'i1', name: 'Whole fish', price: 100_000, ownerIds: ['A', 'B', 'C'] },
        ],
      }),
    );
    expect(r.subtotal).toBe(100_000);
    const sum = Object.values(r.perPerson).reduce((s, v) => s + v, 0);
    expect(sum).toBe(r.total);
    expect(r.total).toBe(200_001);
  });
});
