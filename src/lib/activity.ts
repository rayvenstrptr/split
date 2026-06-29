import type { ActivityEvent, ActivityKind } from '../types';

/** The active (hot) log shows at most this many events. */
export const ACTIVE_CAP = 500;
/** When the active log fills, this many of the oldest events roll into the archive. */
export const ROLL_CHUNK = 250;

const KINDS: ReadonlySet<ActivityKind> = new Set<ActivityKind>([
  'session',
  'bill',
  'person',
  'cloud',
  'backup',
  'edit',
  'system',
]);

/**
 * Split a newest-first event list into the events to {@link keep} active and the
 * oldest ones to {@link roll} off into the archive. Rolls only once the list reaches
 * {@link ACTIVE_CAP}, always leaving the newest `ACTIVE_CAP - ROLL_CHUNK` (250) active.
 * `events` 1..500 → keep 251..500, roll 1..250; refill to 500 → roll the next 250; …
 */
export function rotate(events: ActivityEvent[]): {
  keep: ActivityEvent[];
  roll: ActivityEvent[];
} {
  if (events.length < ACTIVE_CAP) return { keep: events, roll: [] };
  return {
    keep: events.slice(0, ACTIVE_CAP - ROLL_CHUNK),
    roll: events.slice(ACTIVE_CAP - ROLL_CHUNK),
  };
}

/**
 * Union two event lists by `id` (newer `at` wins on conflict), sorted newest-first.
 * Used to fold another device's recent events into the local view. Does not cap —
 * callers apply {@link rotate} afterwards.
 */
export function mergeEvents(
  a: ActivityEvent[],
  b: ActivityEvent[],
): ActivityEvent[] {
  const byId = new Map<string, ActivityEvent>();
  for (const e of a) byId.set(e.id, e);
  for (const e of b) {
    const cur = byId.get(e.id);
    if (!cur || e.at > cur.at) byId.set(e.id, e);
  }
  return [...byId.values()].sort((x, y) => y.at - x.at);
}

/** Validate a `pull_activity` payload (jsonb_agg → array | null) into ActivityEvent[]. */
export function parseEvents(data: unknown): ActivityEvent[] {
  const raw = Array.isArray(data)
    ? data
    : (data as { events?: unknown })?.events;
  if (!Array.isArray(raw)) return [];
  const out: ActivityEvent[] = [];
  for (const r of raw) {
    if (!r || typeof r !== 'object') continue;
    const v = r as Record<string, unknown>;
    if (
      typeof v.id !== 'string' ||
      typeof v.at !== 'number' ||
      typeof v.message !== 'string'
    ) {
      continue;
    }
    const kind: ActivityKind = KINDS.has(v.kind as ActivityKind)
      ? (v.kind as ActivityKind)
      : 'system';
    out.push({ id: v.id, at: v.at, kind, message: v.message });
  }
  return out;
}

/** Shape an event for upload — drops the local-only `dedupeKey`. */
export function stripForUpload(
  events: ActivityEvent[],
): Array<Pick<ActivityEvent, 'id' | 'at' | 'kind' | 'message'>> {
  return events.map(({ id, at, kind, message }) => ({ id, at, kind, message }));
}
