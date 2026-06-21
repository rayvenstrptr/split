import type { AppState } from '../types';

/**
 * The scenario from the brief: 4 people (R, G, H, K) out all day.
 *  - Lunch: R paid; H did not order.
 *  - Coffee: H paid; everyone.
 *  - Dinner: K paid; G did not order.
 *  - Bar: G paid; everyone, G ordered a lot.
 *
 * Lunch & Dinner use "Know the total" (tax/service already baked into the total).
 * Coffee uses percentages. Bar shows G's big order driving a bigger surcharge slice.
 */
export const sampleState: AppState = {
  people: [
    { id: 'R', name: 'R' },
    { id: 'G', name: 'G' },
    { id: 'H', name: 'H' },
    { id: 'K', name: 'K' },
  ],
  bills: [
    {
      id: 'lunch',
      name: 'Lunch',
      payerId: 'R',
      mode: 'fromTotal',
      total: 330_000,
      entries: [
        { personId: 'R', amount: 100_000 },
        { personId: 'G', amount: 90_000 },
        { personId: 'K', amount: 110_000 },
      ],
    },
    {
      id: 'coffee',
      name: 'Coffee',
      payerId: 'H',
      mode: 'fromPercent',
      servicePercent: 5,
      taxPercent: 10,
      entries: [
        { personId: 'R', amount: 35_000 },
        { personId: 'G', amount: 30_000 },
        { personId: 'H', amount: 40_000 },
        { personId: 'K', amount: 30_000 },
      ],
    },
    {
      id: 'dinner',
      name: 'Dinner',
      payerId: 'K',
      mode: 'fromTotal',
      total: 360_000,
      entries: [
        { personId: 'R', amount: 110_000 },
        { personId: 'H', amount: 100_000 },
        { personId: 'K', amount: 90_000 },
      ],
    },
    {
      id: 'bar',
      name: 'Bar',
      payerId: 'G',
      mode: 'fromTotal',
      total: 600_000,
      entries: [
        { personId: 'R', amount: 50_000 },
        { personId: 'G', amount: 300_000 },
        { personId: 'H', amount: 80_000 },
        { personId: 'K', amount: 70_000 },
      ],
    },
  ],
};
