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

  /* ---- Logged-in: compact identity + sync controls ---- */
  if (account) {
    const s = STATUS[syncStatus];
    return (
      <section className="rounded-card border border-line bg-surface p-4 shadow-soft">
        <div className="flex items-center gap-2.5">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-accent-soft text-sm font-extrabold text-accent">
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
          <Button
            variant="secondary"
            size="sm"
            onClick={onSyncNow}
            disabled={syncStatus === 'syncing'}
            className="shrink-0"
            title="Pull the latest sessions from your other devices"
          >
            ↻ Sync now
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onLogout}
            className="shrink-0"
          >
            Log out
          </Button>
        </div>
      </section>
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
    <section className="rounded-card border border-line bg-surface p-4 shadow-soft">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h2 className="text-base font-extrabold tracking-tight">
          Sync across devices
        </h2>
        <span className="text-[12.5px] font-semibold text-muted">Optional</span>
      </div>

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
    </section>
  );
}
