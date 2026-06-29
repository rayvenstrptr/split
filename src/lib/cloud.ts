import type { ActivityEvent, SavedSession } from '../types';
import { buildBackup, parseBackupData } from './backup';
import { parseEvents, stripForUpload } from './activity';

// Supabase project URL + anon public key. The anon key is safe to ship to the
// browser — access is gated by the `*_vault` RPCs' server-side PIN check (see the
// SQL in the cloud-sync plan), not by hiding this key.
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

/** True only when both env vars are set, so the cloud-sync UI can be shown. */
export function cloudConfigured(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_KEY);
}

/** Normalized username key — case/space-insensitive, matched server-side too. */
export function normalizeUsername(username: string): string {
  return username.toLowerCase().trim();
}

/** A PIN must be exactly four digits. */
export function isValidPin(pin: string): boolean {
  return /^[0-9]{4}$/.test(pin);
}

export type CloudError = 'username_taken' | 'invalid_credentials' | 'network';

/** Type guard so callers can branch on a caught CloudError vs. an unexpected throw. */
export function isCloudError(e: unknown): e is CloudError {
  return e === 'username_taken' || e === 'invalid_credentials' || e === 'network';
}

/**
 * Call a Supabase Postgres RPC over plain fetch. Maps a raised SQL exception to our
 * typed CloudError; any transport/config failure becomes 'network'. Returns the
 * parsed JSON body (jsonb RPCs) or null (void RPCs reply empty).
 */
async function rpc(fn: string, args: Record<string, unknown>): Promise<unknown> {
  if (!SUPABASE_URL || !SUPABASE_KEY) throw 'network' as CloudError;
  let res: Response;
  try {
    res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
      },
      body: JSON.stringify(args),
    });
  } catch {
    throw 'network' as CloudError; // offline / DNS / CORS
  }
  if (!res.ok) {
    const body = await res.text();
    if (body.includes('username_taken')) throw 'username_taken' as CloudError;
    if (body.includes('invalid_credentials')) throw 'invalid_credentials' as CloudError;
    throw 'network' as CloudError;
  }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

/** Register a brand-new username, seeding the vault with the current sessions. */
export async function claim(
  username: string,
  pin: string,
  sessions: SavedSession[],
): Promise<void> {
  await rpc('claim_vault', {
    p_username: normalizeUsername(username),
    p_pin: pin,
    p_data: buildBackup(sessions),
  });
}

/**
 * Pull a vault's sessions. Returns `[]` for a fresh/empty vault (nothing to merge
 * yet) rather than throwing; credential errors still propagate from `rpc`.
 */
export async function pull(username: string, pin: string): Promise<SavedSession[]> {
  const data = await rpc('pull_vault', {
    p_username: normalizeUsername(username),
    p_pin: pin,
  });
  try {
    return parseBackupData(data);
  } catch {
    return [];
  }
}

/** Push the full session list up, replacing the vault's stored data. */
export async function push(
  username: string,
  pin: string,
  sessions: SavedSession[],
): Promise<void> {
  await rpc('push_vault', {
    p_username: normalizeUsername(username),
    p_pin: pin,
    p_data: buildBackup(sessions),
  });
}

/**
 * Append activity events to the durable archive (`activity_events` table). Idempotent —
 * the RPC upserts by `(username, id)`, so re-sending events already stored is harmless
 * (and lets coalesced edits update their row). No-ops on an empty list.
 */
export async function appendActivity(
  username: string,
  pin: string,
  events: ActivityEvent[],
): Promise<void> {
  if (events.length === 0) return;
  await rpc('append_activity', {
    p_username: normalizeUsername(username),
    p_pin: pin,
    p_events: stripForUpload(events),
  });
}

/**
 * Pull the most recent archived events (newest first). `before` pages further back by
 * passing the oldest `at` seen so far. Returns `[]` for an empty/fresh archive.
 */
export async function pullActivity(
  username: string,
  pin: string,
  limit = 500,
  before?: number,
): Promise<ActivityEvent[]> {
  const data = await rpc('pull_activity', {
    p_username: normalizeUsername(username),
    p_pin: pin,
    p_limit: limit,
    p_before: before ?? null,
  });
  return parseEvents(data);
}
