import { useRef, useState } from 'react';
import type { SavedSession } from '../types';
import { formatDateTime } from '../lib/date';

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
    <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-base font-semibold">Sessions</h2>
        <span className="text-xs text-muted">
          {currentId ? 'Saved session' : 'Unsaved working copy'}
        </span>
      </div>

      <div className="flex gap-2">
        <input
          value={sessionName}
          onChange={(e) => onNameChange(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && save()}
          placeholder="Name this day (e.g. Birthday dinner)"
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-accent"
        />
        <button
          type="button"
          onClick={save}
          className="shrink-0 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
        >
          {flash ? 'Saved!' : currentId ? 'Update' : 'Save'}
        </button>
      </div>

      {sorted.length > 0 && (
        <ul className="mt-4 space-y-1.5">
          {sorted.map((s) => {
            const active = s.id === currentId;
            return (
              <li
                key={s.id}
                className={`flex items-center gap-2 rounded-xl border px-3 py-2 ${
                  active
                    ? 'border-accent bg-accent-soft/50'
                    : 'border-gray-200 bg-gray-50'
                }`}
              >
                <button
                  type="button"
                  onClick={() => onLoad(s.id)}
                  className="min-w-0 flex-1 text-left"
                >
                  <div className="truncate text-sm font-medium">
                    {s.name}
                    {active && (
                      <span className="ml-2 text-xs font-normal text-accent">
                        · current
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-muted">
                    {s.state.bills.length} stops · {s.state.people.length} people ·{' '}
                    {formatDateTime(s.savedAt)}
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => onLoad(s.id)}
                  className="shrink-0 rounded-lg border border-gray-300 bg-white px-2.5 py-1 text-xs font-medium text-ink transition-colors hover:border-accent hover:text-accent"
                >
                  Load
                </button>
                <button
                  type="button"
                  onClick={() => onExportSession(s.id)}
                  aria-label={`Export ${s.name} to a file`}
                  title="Download this session as a file"
                  className="shrink-0 grid h-7 w-7 place-items-center rounded-lg text-muted transition-colors hover:bg-accent-soft hover:text-accent"
                >
                  ↓
                </button>
                <button
                  type="button"
                  onClick={() => onDelete(s.id)}
                  aria-label={`Delete ${s.name}`}
                  className="shrink-0 grid h-7 w-7 place-items-center rounded-lg text-muted transition-colors hover:bg-rose-50 hover:text-negative"
                >
                  ✕
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={onNew}
          className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-ink transition-colors hover:border-accent hover:text-accent"
        >
          + New session
        </button>
        <button
          type="button"
          onClick={onLoadExample}
          className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-muted transition-colors hover:border-accent hover:text-accent"
        >
          Load example
        </button>
      </div>

      <div className="mt-2 flex items-center gap-2">
        <button
          type="button"
          onClick={onExportAll}
          disabled={history.length === 0}
          title="Download all saved sessions as a backup file"
          className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-ink transition-colors hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-40"
        >
          ↓ Backup all
        </button>
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          title="Restore sessions from a backup file"
          className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-ink transition-colors hover:border-accent hover:text-accent"
        >
          ↑ Restore
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={onFile}
        />
      </div>
      <p className="mt-2 text-xs text-muted">
        Sessions are saved in this browser. Back up to a file so they survive
        clearing browser data or switching devices.
      </p>
    </section>
  );
}
