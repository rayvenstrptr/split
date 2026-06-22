/**
 * Per-person color palette for avatars and chips. Colors are assigned by a
 * person's index in the group, so each person reads as a consistent hue across
 * the whole app (header, bills, settlement). Warm, on-brand set led by emerald
 * and terracotta.
 */
export const PERSON_COLORS = [
  { bg: '#0F8A6E', soft: '#D8EFE7' }, // emerald
  { bg: '#E0824A', soft: '#FAE7D5' }, // terracotta
  { bg: '#3E6DB5', soft: '#DEE8F6' }, // indigo
  { bg: '#9B5BA8', soft: '#EFE0F2' }, // plum
  { bg: '#C99A2E', soft: '#F6ECCF' }, // gold
  { bg: '#5A8A4C', soft: '#E2EFDB' }, // olive
] as const;

export function colorFor(i: number) {
  const n = PERSON_COLORS.length;
  return PERSON_COLORS[((i % n) + n) % n];
}

/** Stable index of a person in the group (clamped to 0 if not found). */
export function personIndex(people: { id: string }[], id: string): number {
  return Math.max(
    0,
    people.findIndex((p) => p.id === id),
  );
}
