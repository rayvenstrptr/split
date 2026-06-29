import { useState } from 'react';
import { Button, Segmented } from './ui';
import { isValidPin } from '../lib/cloud';

export type SyncStatus = 'idle' | 'syncing' | 'synced' | 'error';

type Props = {
  /** The logged-in identity, or null when signed out. */
  account: { username: string } | null;
  syncStatus: SyncStatus;
  /** Resolve to a user-facing error message, or null on success. */
  onLogin: (username: string, pin: string) => Promise<string | null>;
  onCreate: (username: string, pin: string) => Promise<string | null>;
  onSyncNow: () => void;
  onLogout: () => void;
};

const STATUS: Record<SyncStatus, { label: string; className: string }> = {
  idle: { label: 'Not synced yet', className: 'text-faint' },
  syncing: { label: 'Syncing…', className: 'text-muted' },
  synced: { label: 'Synced ✓', className: 'text-accent' },
  error: { label: 'Not synced — offline?', className: 'text-negative' },
};

export default function CloudSyncPanel({
  account,
  syncStatus,
  onLogin,
  onCreate,
  onSyncNow,
  onLogout,
}: Props) {
  const [mode, setMode] = useState<'login' | 'create'>('login');
  const [username, setUsername] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  /* ---- Logged-in: identity + sync controls (stacked for the narrow rail) ---- */
  if (account) {
    const s = STATUS[syncStatus];
    return (
      <div>
        <div className="flex items-center gap-2.5 rounded-well bg-accent-soft px-2.5 py-2">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-accent text-sm font-extrabold text-white">
            {account.username.slice(0, 2).toUpperCase()}
          </span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-extrabold text-ink">
              @{account.username}
            </div>
            <div className={`text-[11.5px] font-semibold ${s.className}`}>
              {s.label}
            </div>
          </div>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={onSyncNow}
            disabled={syncStatus === 'syncing'}
            className="w-full"
            title="Pull the latest sessions from your other devices"
          >
            ↻ Sync now
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onLogout}
            className="w-full"
          >
            Log out
          </Button>
        </div>
      </div>
    );
  }

  /* ---- Logged-out: log in / create ---- */
  const canSubmit = username.trim().length > 0 && isValidPin(pin) && !busy;

  const submit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    const err =
      mode === 'login'
        ? await onLogin(username, pin)
        : await onCreate(username, pin);
    setBusy(false);
    if (err) {
      setError(err);
    } else {
      setUsername('');
      setPin('');
    }
  };

  return (
    <div>
      <p className="mb-2.5 text-[12px] leading-snug text-muted">
        Optional — sign in to carry your saved days across devices.
      </p>

      <Segmented<'login' | 'create'>
        options={[
          { label: 'Log in', value: 'login' },
          { label: 'Create', value: 'create' },
        ]}
        value={mode}
        onChange={(v) => {
          setMode(v);
          setError(null);
        }}
      />

      <div className="mt-3 flex flex-col gap-2">
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          placeholder="Username (any name you like)"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          aria-label="Username"
          className="rounded-field border-[1.5px] border-line-strong bg-surface px-3 py-2.5 text-sm text-ink outline-none focus:border-accent"
        />
        <input
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          placeholder="4-digit code"
          inputMode="numeric"
          autoComplete="off"
          aria-label="4-digit code"
          className="rounded-field border-[1.5px] border-line-strong bg-surface px-3 py-2.5 text-sm tracking-[0.35em] text-ink outline-none focus:border-accent"
        />
      </div>

      {error && (
        <p className="mt-2 text-xs font-semibold text-negative">{error}</p>
      )}

      <Button onClick={submit} disabled={!canSubmit} className="mt-3 w-full">
        {busy ? 'Working…' : mode === 'login' ? 'Log in & pull' : 'Create account'}
      </Button>

      <p className="mx-0.5 mt-2.5 text-xs text-muted">
        {mode === 'login'
          ? 'Logging in pulls your saved sessions onto this device and merges them in.'
          : 'Pick a username and a 4-digit code. There’s no code recovery — remember it.'}
      </p>
    </div>
  );
}
