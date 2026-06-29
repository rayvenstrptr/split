import { useEffect } from 'react';
import CloudSyncPanel, { type SyncStatus } from './CloudSyncPanel';

export type ActiveApp = 'split' | 'wheel';

/** Cloud-sync wiring for the sidebar login (null when sync isn't configured). */
export type SidebarCloud = {
  account: { username: string } | null;
  syncStatus: SyncStatus;
  onLogin: (username: string, pin: string) => Promise<string | null>;
  onCreate: (username: string, pin: string) => Promise<string | null>;
  onSyncNow: () => void;
  onLogout: () => void;
};

const APPS: { id: ActiveApp; label: string; icon: string; blurb: string }[] = [
  { id: 'split', label: 'Split Bill', icon: '🧾', blurb: 'Split a day of bills' },
  { id: 'wheel', label: 'Spin Wheel', icon: '🎡', blurb: 'Pick a random name' },
];

type Props = {
  open: boolean;
  active: ActiveApp;
  onSelect: (app: ActiveApp) => void;
  onClose: () => void;
  /** Cloud login shown at the top of the drawer, or null when sync is off. */
  cloud: SidebarCloud | null;
};

/** Slide-out drawer to switch between the app's two screens. */
export default function Sidebar({ open, active, onSelect, onClose, cloud }: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <>
      {/* Scrim */}
      <div
        onClick={onClose}
        aria-hidden
        className={`fixed inset-0 z-40 bg-ink/30 transition-opacity duration-200 ${
          open ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
      />
      {/* Panel */}
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Choose app"
        className={`fixed left-0 top-0 z-50 flex h-full w-64 max-w-[80%] flex-col bg-surface shadow-hero transition-transform duration-200 ease-out ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between px-4 pb-3 pt-5">
          <span className="text-[13px] font-bold uppercase tracking-wide text-faint">
            Menu
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close menu"
            className="grid h-7 w-7 place-items-center rounded-full text-faint transition-colors hover:bg-surface-2 hover:text-ink"
          >
            ×
          </button>
        </div>

        <div className="flex-1 overflow-y-auto pb-4">
          {cloud && (
            <>
              <div className="px-4 pb-4">
                <span className="mb-2.5 block text-[13px] font-bold uppercase tracking-wide text-faint">
                  Account
                </span>
                <CloudSyncPanel
                  account={cloud.account}
                  syncStatus={cloud.syncStatus}
                  onLogin={cloud.onLogin}
                  onCreate={cloud.onCreate}
                  onSyncNow={cloud.onSyncNow}
                  onLogout={cloud.onLogout}
                />
              </div>
              <hr className="mx-4 mb-3 border-0 border-t border-line" />
            </>
          )}

          <span className="block px-4 pb-2 text-[13px] font-bold uppercase tracking-wide text-faint">
            Apps
          </span>
          <nav className="flex flex-col gap-1 px-2.5">
            {APPS.map((app) => {
            const on = app.id === active;
            return (
              <button
                key={app.id}
                type="button"
                onClick={() => onSelect(app.id)}
                aria-current={on ? 'page' : undefined}
                className={`flex items-center gap-3 rounded-well px-3 py-2.5 text-left transition-colors ${
                  on
                    ? 'bg-accent text-white'
                    : 'text-ink hover:bg-accent-soft'
                }`}
              >
                <span className="text-[20px] leading-none" aria-hidden>
                  {app.icon}
                </span>
                <span className="leading-tight">
                  <span className="block text-sm font-bold">{app.label}</span>
                  <span
                    className={`block text-[11px] ${
                      on ? 'text-white/80' : 'text-muted'
                    }`}
                  >
                    {app.blurb}
                  </span>
                </span>
              </button>
            );
            })}
          </nav>
        </div>
      </aside>
    </>
  );
}
