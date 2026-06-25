import type { SavedSession } from '../types';

const APP = 'split-bill-id';
const KIND = 'sessions-backup';

export type Backup = {
  app: string;
  kind: string;
  version: number;
  exportedAt: number;
  sessions: SavedSession[];
};

export function buildBackup(sessions: SavedSession[]): Backup {
  return {
    app: APP,
    kind: KIND,
    version: 1,
    exportedAt: Date.now(),
    sessions,
  };
}

/** Trigger a browser download of `data` as pretty-printed JSON. */
export function downloadJSON(filename: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function isValidSession(s: unknown): s is SavedSession {
  if (!s || typeof s !== 'object') return false;
  const v = s as Record<string, unknown>;
  const state = v.state as Record<string, unknown> | undefined;
  return (
    typeof v.id === 'string' &&
    typeof v.name === 'string' &&
    !!state &&
    Array.isArray(state.people) &&
    Array.isArray(state.bills)
  );
}

/**
 * Validate an already-parsed backup value. Accepts either a wrapped
 * `{ sessions: [...] }` object or a raw `SavedSession[]` array. Throws if no valid
 * sessions are found. Shared by `parseBackup` (file restore) and cloud pull.
 */
export function parseBackupData(data: unknown): SavedSession[] {
  const raw = Array.isArray(data)
    ? data
    : (data as { sessions?: unknown })?.sessions;
  if (!Array.isArray(raw)) {
    throw new Error('File does not contain a list of sessions.');
  }
  const sessions = raw.filter(isValidSession);
  if (sessions.length === 0) {
    throw new Error('No valid sessions found in the file.');
  }
  return sessions;
}

/**
 * Parse a backup file. Accepts either a wrapped `{ sessions: [...] }` object or a
 * raw `SavedSession[]` array (so the JSON copied straight from localStorage works).
 * Throws if no valid sessions are found.
 */
export function parseBackup(text: string): SavedSession[] {
  return parseBackupData(JSON.parse(text));
}

/**
 * Merge imported sessions into the existing list: union by id, the newer
 * `savedAt` wins. Idempotent — re-importing the same file changes nothing.
 */
export function mergeSessions(
  existing: SavedSession[],
  incoming: SavedSession[],
): { merged: SavedSession[]; added: number; updated: number } {
  const byId = new Map(existing.map((s) => [s.id, s]));
  let added = 0;
  let updated = 0;
  for (const s of incoming) {
    const current = byId.get(s.id);
    if (!current) {
      byId.set(s.id, s);
      added++;
    } else if (s.savedAt > current.savedAt) {
      byId.set(s.id, s);
      updated++;
    }
  }
  const merged = [...byId.values()].sort((a, b) => b.savedAt - a.savedAt);
  return { merged, added, updated };
}

/** Filesystem-safe slug for filenames, e.g. "Bandung Trip" -> "bandung-trip". */
export function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '') || 'session'
  );
}

/** YYYY-MM-DD for filenames. */
export function fileDate(ms = Date.now()): string {
  return new Date(ms).toISOString().slice(0, 10);
}
