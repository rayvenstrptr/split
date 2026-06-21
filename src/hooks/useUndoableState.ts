import { useCallback, useRef, useState } from 'react';

type Stacks<T> = { past: T[]; present: T; future: T[] };
type Updater<T> = T | ((prev: T) => T);

type Options = {
  /** Max number of undo steps to keep. */
  limit?: number;
  /** Successive changes within this window collapse into one undo step (ms). */
  coalesceMs?: number;
};

/**
 * State with undo/redo. Keeps past/present/future stacks. Rapid successive
 * changes (e.g. typing) within `coalesceMs` collapse into a single undo step.
 *
 * The state updater is kept pure (coalesce timing is decided in the callback
 * body, not inside `setStacks`) so it is safe under React StrictMode's
 * double-invocation in development.
 */
export function useUndoableState<T>(initial: T, options: Options = {}) {
  const limit = options.limit ?? 50;
  const coalesceMs = options.coalesceMs ?? 0;

  const [stacks, setStacks] = useState<Stacks<T>>({
    past: [],
    present: initial,
    future: [],
  });
  const lastChange = useRef(0);

  const setState = useCallback(
    (updater: Updater<T>) => {
      const now = Date.now();
      const coalesce = coalesceMs > 0 && now - lastChange.current < coalesceMs;
      lastChange.current = now;

      setStacks((s) => {
        const next =
          typeof updater === 'function'
            ? (updater as (p: T) => T)(s.present)
            : updater;
        if (Object.is(next, s.present)) return s;
        const past = coalesce
          ? s.past
          : [...s.past, s.present].slice(-limit);
        return { past, present: next, future: [] };
      });
    },
    [coalesceMs, limit],
  );

  const undo = useCallback(() => {
    lastChange.current = 0;
    setStacks((s) => {
      if (s.past.length === 0) return s;
      const previous = s.past[s.past.length - 1];
      return {
        past: s.past.slice(0, -1),
        present: previous,
        future: [s.present, ...s.future].slice(0, limit),
      };
    });
  }, [limit]);

  const redo = useCallback(() => {
    lastChange.current = 0;
    setStacks((s) => {
      if (s.future.length === 0) return s;
      const next = s.future[0];
      return {
        past: [...s.past, s.present].slice(-limit),
        present: next,
        future: s.future.slice(1),
      };
    });
  }, [limit]);

  /** Replace the value and clear all undo history (e.g. a hard reset). */
  const reset = useCallback((value: T) => {
    lastChange.current = 0;
    setStacks({ past: [], present: value, future: [] });
  }, []);

  return {
    state: stacks.present,
    setState,
    undo,
    redo,
    reset,
    canUndo: stacks.past.length > 0,
    canRedo: stacks.future.length > 0,
  } as const;
}
