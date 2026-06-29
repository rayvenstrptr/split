import { describe, it, expect } from 'vitest';
import type { ActivityEvent } from '../types';
import {
  rotate,
  mergeEvents,
  parseEvents,
  ACTIVE_CAP,
  ROLL_CHUNK,
} from './activity';

const ev = (
  id: string,
  at = 0,
  message = id,
  kind: ActivityEvent['kind'] = 'system',
): ActivityEvent => ({ id, at, kind, message });

/** n events, newest-first (e0 newest), so slice(0) = newest. */
const many = (n: number) =>
  Array.from({ length: n }, (_, i) => ev('e' + i, n - i));

describe('rotate', () => {
  it('keeps everything and rolls nothing below the cap', () => {
    const { keep, roll } = rotate(many(10));
    expect(keep).toHaveLength(10);
    expect(roll).toHaveLength(0);
  });

  it('at the cap, keeps the newest 250 and rolls the oldest 250', () => {
    const { keep, roll } = rotate(many(ACTIVE_CAP));
    expect(keep).toHaveLength(ACTIVE_CAP - ROLL_CHUNK); // 250 newest
    expect(roll).toHaveLength(ROLL_CHUNK); // 250 oldest
    expect(keep[0].id).toBe('e0'); // newest stays
    expect(roll[0].id).toBe('e' + (ACTIVE_CAP - ROLL_CHUNK)); // e250 = first rolled
  });

  it('over the cap, still leaves exactly 250 active (rolls the rest)', () => {
    const { keep, roll } = rotate(many(600));
    expect(keep).toHaveLength(250);
    expect(roll).toHaveLength(350);
  });
});

describe('mergeEvents', () => {
  it('unions by id and sorts newest first', () => {
    const merged = mergeEvents([ev('a', 1)], [ev('b', 2)]);
    expect(merged.map((e) => e.id)).toEqual(['b', 'a']);
  });

  it('on an id conflict the newer `at` wins', () => {
    const merged = mergeEvents(
      [ev('a', 1, 'old')],
      [ev('a', 2, 'new')],
    );
    expect(merged).toHaveLength(1);
    expect(merged[0].message).toBe('new');
  });

  it('does not let an older incoming clobber a newer existing', () => {
    const merged = mergeEvents([ev('a', 5, 'keep')], [ev('a', 2, 'stale')]);
    expect(merged[0].message).toBe('keep');
  });
});

describe('parseEvents', () => {
  it('reads a valid array', () => {
    const out = parseEvents([{ id: 'a', at: 1, kind: 'bill', message: 'm' }]);
    expect(out).toEqual([{ id: 'a', at: 1, kind: 'bill', message: 'm' }]);
  });

  it('accepts a wrapped { events: [...] } payload', () => {
    const out = parseEvents({
      events: [{ id: 'a', at: 1, kind: 'bill', message: 'm' }],
    });
    expect(out).toHaveLength(1);
  });

  it('returns [] for null / non-array', () => {
    expect(parseEvents(null)).toEqual([]);
    expect(parseEvents('nope')).toEqual([]);
  });

  it('drops malformed entries and falls back to a known kind', () => {
    const out = parseEvents([
      { id: 'a', at: 1, kind: 'mystery', message: 'm' }, // unknown kind
      { id: 'b' }, // missing fields
      { at: 2, kind: 'bill', message: 'x' }, // missing id
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ id: 'a', kind: 'system' });
  });
});
