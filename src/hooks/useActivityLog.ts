import { useCallback, useEffect } from 'react';
import type { ActivityEvent, ActivityKind } from '../types';
import { useLocalStorage } from './useLocalStorage';
import { uid } from '../lib/id';
import { rotate, mergeEvents, ACTIVE_CAP } from '../lib/activity';

const ACTIVE_KEY = 'split-bill-id/activity/v1'; // hot log shown in the panel
const PENDING_KEY = 'split-bill-id/activity-archive/v1'; // rolled-off, awaiting upload

/** A burst of edits to the same target within this window collapses into one row. */
const COALESCE_MS = 2 * 60 * 1000;

/**
 * The activity log: a capped, newest-first "active" buffer plus a "pending" buffer of
 * events that have rolled off the active log and are waiting to be archived to the
 * server (see {@link rotate}). Both live in localStorage so the log survives a refresh
 * and works while logged out. Rotation runs in an effect so `log`/`mergeIn` only ever
 * grow `events`; overflow is moved to `pending` on the next commit.
 */
export function useActivityLog() {
  const [events, setEvents] = useLocalStorage<ActivityEvent[]>(ACTIVE_KEY, []);
  const [pending, setPending] = useLocalStorage<ActivityEvent[]>(PENDING_KEY, []);

  // Move the oldest events off the active log into `pending` once it fills. The
  // append is deduped by id so it stays correct if this effect runs twice for the
  // same batch (React StrictMode double-invokes mount effects in dev).
  useEffect(() => {
    if (events.length < ACTIVE_CAP) return;
    const { keep, roll } = rotate(events);
    if (roll.length === 0) return;
    setPending((p) => {
      const have = new Set(p.map((e) => e.id));
      const add = roll.filter((e) => !have.has(e.id));
      return add.length ? [...p, ...add] : p;
    });
    setEvents(keep);
  }, [events, setEvents, setPending]);

  const log = useCallback(
    (kind: ActivityKind, message: string, dedupeKey?: string) => {
      setEvents((prev) => {
        const now = Date.now();
        const head = prev[0];
        // Coalesce: refresh the head row instead of stacking a new one.
        if (
          dedupeKey &&
          head &&
          head.kind === kind &&
          head.dedupeKey === dedupeKey &&
          now - head.at < COALESCE_MS
        ) {
          return [{ ...head, at: now, message }, ...prev.slice(1)];
        }
        return [{ id: uid('a_'), at: now, kind, message, dedupeKey }, ...prev];
      });
    },
    [setEvents],
  );

  /** Fold another device's events into the active view (rotation effect caps it). */
  const mergeIn = useCallback(
    (incoming: ActivityEvent[]) => {
      if (incoming.length === 0) return;
      setEvents((prev) => mergeEvents(prev, incoming));
    },
    [setEvents],
  );

  /** Drop the pending events that were just uploaded (by id), keeping any new roll-offs. */
  const dropPending = useCallback(
    (ids: string[]) => {
      if (ids.length === 0) return;
      const drop = new Set(ids);
      setPending((p) => p.filter((e) => !drop.has(e.id)));
    },
    [setPending],
  );

  /** Empty the active view only. Pending roll-offs and the server archive are kept. */
  const clear = useCallback(() => setEvents([]), [setEvents]);

  return { events, pending, log, mergeIn, dropPending, clear };
}
