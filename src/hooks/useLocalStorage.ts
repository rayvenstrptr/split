import { useEffect, useState } from 'react';

/** State synced to localStorage so a day's bills survive a refresh. */
export function useLocalStorage<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : initial;
    } catch {
      return initial;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // storage full / unavailable — ignore, app still works in memory
    }
  }, [key, value]);

  return [value, setValue] as const;
}
