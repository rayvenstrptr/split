import { useRef, useState } from 'react';
import type { SavedSession } from '../types';
import { formatDateTime } from '../lib/date';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { Button } from './ui';

type Props = {
  sessionName: string;
  onNameChange: (name: string) => void;
  currentId: string | null;
  history: SavedSession[];
  onSave: () => void;
  onLoad: (id: string) => void;
  onDelete: (id: string) => void;
  onNew: () => void;
  onLoadExample: () => void;
  onExportAll: () => void;
  onExportSession: (id: string) => void;
  onImportText: (text: string) => void;
};

export default function HistoryPanel({
  sessionName,
  onNameChange,
  currentId,
  history,
  onSave,
  onLoad,
  onDelete,
  onNew,
  onLoadExample,
  onExportAll,
  onExportSession,
  onImportText,
}: Props) {
  const [flash, setFlash] = useState(false);
  const [collapsed, setCollapsed] = useLocalStorage(
    'split-bill-id/sessions-collapsed/v1',
    false,
  );
  const fileRef = useRef<HTMLInputElement>(null);

  const save = () => {
    onSave();
    setFlash(true);
    setTimeout(() => setFlash(false), 1400);
  };

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => onImportText(String(reader.result));
      reader.readAsText(file);
    }
    e.target.value = ''; // allow re-picking the same file
  };

  const sorted = [...history].sort((a, b) => b.savedAt - a.savedAt);

  return (
    <section className="rounded-card border border-line bg-surface p-4 shadow-soft">
      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        aria-expanded={!collapsed}
        className={`flex w-full items-baseline justify-between gap-2 text-left ${
          collapsed ? '' : 'mb-3'
        }`}
      >
        <span className="flex items-center gap-2">
          <span
            aria-hidden
            className="text-xs text-faint transition-transform"
            style={{ transform: collapsed ? 'none' : 'rotate(90deg)' }}
          >
            ▸
          </span>
          <span className="text-base font-extrabold tracking-tight">Sessions</span>
        </span>
        <span className="whitespace-nowrap text-xs font-semibold text-muted">
          {collapsed
            ? `${currentId ? 'Saved session' : 'Working copy'} · ${history.length} saved`
            : currentId
              ? 'Saved session'
              : 'Unsaved working copy'}
        </span>
      </button>

      {collapsed ? null : (
        <>
          <div className="flex gap-2">
            <input
              value={sessionName}
              onChange={(e) => onNameChange(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && save()}
              placeholder="Name this occasion (e.g. Birthday dinner)"
              className="min-w-0 flex-1 rounded-field border-[1.5px] border-line-strong bg-surface px-3 py-2.5 text-sm text-ink outline-none focus:border-accent"
            />
            <Button onClick={save} className="min-w-[84px] shrink-0">
              {flash ? 'Saved!' : currentId ? 'Update' : 'Save'}
            </Button>
          </div>

          {sorted.length > 0 && (
            <ul className="mt-3.5 flex flex-col gap-1.5">
              {sorted.map((s) => {
                const active = s.id === currentId;
                return (
                  <li
                    key={s.id}
                    className={`flex items-center gap-1.5 rounded-well border-[1.5px] px-2.5 py-2 ${
                      active
                        ? 'border-accent bg-accent-soft'
                        : 'border-line bg-surface-2'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => onLoad(s.id)}
                      className="min-w-0 flex-1 text-left"
                    >
                      <div className="truncate text-sm font-bold text-ink">
                        {s.name}
                        {active && (
                          <span className="ml-2 text-xs font-semibold text-accent">
                            · current
                          </span>
                        )}
                      </div>
                      <div className="text-[11.5px] text-muted">
                        {s.state.bills.length} stops · {s.state.people.length} people ·{' '}
                        {formatDateTime(s.savedAt)}
                      </div>
                    </button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => onLoad(s.id)}
                      className="shrink-0"
                    >
                      Load
                    </Button>
                    <button
                      type="button"
                      onClick={() => onExportSession(s.id)}
                      aria-label={`Export ${s.name} to a file`}
                      title="Download this session as a file"
                      className="grid h-[30px] w-[30px] shrink-0 place-items-center rounded-field text-sm text-faint transition-colors hover:bg-accent-soft hover:text-accent"
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      onClick={() => onDelete(s.id)}
                      aria-label={`Delete ${s.name}`}
                      title="Delete"
                      className="grid h-[30px] w-[30px] shrink-0 place-items-center rounded-field text-sm text-faint transition-colors hover:bg-negative-soft hover:text-negative"
                    >
                      ✕
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          <div className="mt-3.5 flex gap-2">
            <Button variant="secondary" onClick={onNew} className="flex-1">
              + New session
            </Button>
            <Button variant="secondary" onClick={onLoadExample} className="flex-1">
              Load example
            </Button>
          </div>

          <div className="mt-2 flex items-center gap-2">
            <Button
              variant="secondary"
              onClick={onExportAll}
              disabled={history.length === 0}
              title="Download all saved sessions as a backup file"
              className="flex-1"
            >
              ↓ Backup all
            </Button>
            <Button
              variant="secondary"
              onClick={() => fileRef.current?.click()}
              title="Restore sessions from a backup file"
              className="flex-1"
            >
              ↑ Restore
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              hidden
              onChange={onFile}
            />
          </div>
          <p className="mx-0.5 mt-2.5 text-xs text-muted">
            Sessions are saved in this browser. Back up to a file so they survive
            clearing browser data or switching devices.
          </p>
        </>
      )}
    </section>
  );
}
