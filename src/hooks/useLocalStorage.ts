import { useEffect, useState } from 'react';

/** Read and parse a localStorage value, falling back if missing/unreadable. */
export function readStored<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

/** Persist a value to localStorage; silently no-op if storage is unavailable. */
export function writeStored<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // storage full / unavailable — ignore, app still works in memory
  }
}

/** State synced to localStorage so a day's bills survive a refresh. */
export function useLocalStorage<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => readStored(key, initial));

  useEffect(() => {
    writeStored(key, value);
  }, [key, value]);

  return [value, setValue] as const;
}
