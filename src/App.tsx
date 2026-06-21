import { useEffect } from 'react';
import type { AppState, Bill, Person, SavedSession } from './types';
import {
  useLocalStorage,
  readStored,
  writeStored,
} from './hooks/useLocalStorage';
import { useUndoableState } from './hooks/useUndoableState';
import { sampleState } from './data/sample';
import { uid } from './lib/id';
import { formatDate } from './lib/date';
import {
  buildBackup,
  downloadJSON,
  parseBackup,
  mergeSessions,
  slugify,
  fileDate,
} from './lib/backup';
import HistoryPanel from './components/HistoryPanel';
import PeoplePanel from './components/PeoplePanel';
import BillsPanel from './components/BillsPanel';
import SettlementPanel from './components/SettlementPanel';

const STORAGE_KEY = 'split-bill-id/v1'; // current working state
const HISTORY_KEY = 'split-bill-id/history/v1'; // saved sessions
const NAME_KEY = 'split-bill-id/session-name/v1';
const CURRENT_ID_KEY = 'split-bill-id/session-id/v1';

export default function App() {
  const { state, setState, undo, redo, canUndo, canRedo } =
    useUndoableState<AppState>(readStored(STORAGE_KEY, sampleState), {
      coalesceMs: 400,
    });
  const [history, setHistory] = useLocalStorage<SavedSession[]>(HISTORY_KEY, []);
  const [sessionName, setSessionName] = useLocalStorage<string>(NAME_KEY, '');
  const [currentId, setCurrentId] = useLocalStorage<string | null>(
    CURRENT_ID_KEY,
    null,
  );

  // Persist the working state (the undo stacks themselves stay in memory).
  useEffect(() => {
    writeStored(STORAGE_KEY, state);
  }, [state]);

  // Keyboard: Cmd/Ctrl+Z undo, Cmd/Ctrl+Shift+Z or Ctrl+Y redo.
  // Skip while focus is in a field so native text-edit undo still works.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      const el = document.activeElement;
      const editable =
        el instanceof HTMLInputElement ||
        el instanceof HTMLTextAreaElement ||
        el instanceof HTMLSelectElement;
      if (editable) return;
      const key = e.key.toLowerCase();
      if (key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if ((key === 'z' && e.shiftKey) || key === 'y') {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo]);

  /* ---- People ---- */
  const addPerson = (name: string) => {
    const person: Person = { id: uid('p_'), name };
    setState((s) => ({ ...s, people: [...s.people, person] }));
  };

  const removePerson = (id: string) => {
    const used = state.bills.some(
      (b) => b.payerId === id || b.entries.some((e) => e.personId === id),
    );
    if (
      used &&
      !confirm(
        'This person appears in one or more bills. Remove them and their entries?',
      )
    ) {
      return;
    }
    setState((s) => {
      const people = s.people.filter((p) => p.id !== id);
      const fallback = people[0]?.id ?? '';
      const bills = s.bills.map((b) => ({
        ...b,
        payerId: b.payerId === id ? fallback : b.payerId,
        entries: b.entries.filter((e) => e.personId !== id),
      }));
      return { people, bills };
    });
  };

  /* ---- Bills ---- */
  const addBill = () => {
    const newBill: Bill = {
      id: uid('b_'),
      name: `Stop ${state.bills.length + 1}`,
      payerId: state.people[0]?.id ?? '',
      entries: state.people.map((p) => ({ personId: p.id, amount: 0 })),
      mode: 'fromTotal',
      total: 0,
    };
    setState((s) => ({ ...s, bills: [...s.bills, newBill] }));
  };

  const updateBill = (bill: Bill) => {
    setState((s) => ({
      ...s,
      bills: s.bills.map((b) => (b.id === bill.id ? bill : b)),
    }));
  };

  const removeBill = (id: string) => {
    setState((s) => ({ ...s, bills: s.bills.filter((b) => b.id !== id) }));
  };

  /* ---- Sessions / history ---- */
  const saveSession = () => {
    const name = sessionName.trim() || `Day out — ${formatDate(Date.now())}`;
    const now = Date.now();
    const snapshot = structuredClone(state);

    if (currentId && history.some((s) => s.id === currentId)) {
      setHistory(
        history.map((s) =>
          s.id === currentId ? { ...s, name, savedAt: now, state: snapshot } : s,
        ),
      );
    } else {
      const id = uid('s_');
      setCurrentId(id);
      setHistory([{ id, name, savedAt: now, state: snapshot }, ...history]);
    }
    setSessionName(name);
  };

  const loadSession = (id: string) => {
    const session = history.find((s) => s.id === id);
    if (!session || session.id === currentId) {
      if (session) {
        setState(structuredClone(session.state));
        setSessionName(session.name);
      }
      return;
    }
    if (
      !confirm(
        `Load "${session.name}"? Any unsaved changes to the current session will be lost.`,
      )
    ) {
      return;
    }
    setState(structuredClone(session.state));
    setSessionName(session.name);
    setCurrentId(session.id);
  };

  const deleteSession = (id: string) => {
    const session = history.find((s) => s.id === id);
    if (!confirm(`Delete saved session "${session?.name ?? ''}"?`)) return;
    setHistory(history.filter((s) => s.id !== id));
    if (currentId === id) setCurrentId(null);
  };

  const newSession = () => {
    // Keep the same people (you usually go out with the same crew), clear bills.
    setState((s) => ({ people: s.people, bills: [] }));
    setSessionName('');
    setCurrentId(null);
  };

  const loadExample = () => {
    if (
      !confirm('Load the example day? Unsaved changes to the current session will be lost.')
    ) {
      return;
    }
    setState(structuredClone(sampleState));
    setSessionName('Example day out');
    setCurrentId(null);
  };

  /* ---- Backup / restore (durable, file-based) ---- */
  const exportAllSessions = () => {
    if (history.length === 0) return;
    downloadJSON(`split-bill-sessions-${fileDate()}.json`, buildBackup(history));
  };

  const exportSession = (id: string) => {
    const session = history.find((s) => s.id === id);
    if (!session) return;
    downloadJSON(
      `split-bill-${slugify(session.name)}-${fileDate(session.savedAt)}.json`,
      buildBackup([session]),
    );
  };

  const importSessionsText = (text: string) => {
    try {
      const incoming = parseBackup(text);
      const { merged, added, updated } = mergeSessions(history, incoming);
      setHistory(merged);
      alert(
        `Restored ${incoming.length} session(s): ${added} new, ${updated} updated.`,
      );
    } catch (err) {
      alert(
        `Could not read that backup file.\n${
          err instanceof Error ? err.message : ''
        }`,
      );
    }
  };

  return (
    <div className="mx-auto min-h-full max-w-2xl px-4 pb-16 pt-8">
      <header className="mb-6 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Split Bill</h1>
          <p className="text-sm text-muted">
            A day out in Indonesia · all amounts in Rupiah
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={undo}
            disabled={!canUndo}
            title="Undo (⌘Z)"
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-ink transition-colors hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-40"
          >
            ↶ Undo
          </button>
          <button
            type="button"
            onClick={redo}
            disabled={!canRedo}
            title="Redo (⌘⇧Z)"
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-ink transition-colors hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-40"
          >
            ↷ Redo
          </button>
        </div>
      </header>

      <div className="space-y-6">
        <HistoryPanel
          sessionName={sessionName}
          onNameChange={setSessionName}
          currentId={currentId}
          history={history}
          onSave={saveSession}
          onLoad={loadSession}
          onDelete={deleteSession}
          onNew={newSession}
          onLoadExample={loadExample}
          onExportAll={exportAllSessions}
          onExportSession={exportSession}
          onImportText={importSessionsText}
        />
        <PeoplePanel
          people={state.people}
          onAdd={addPerson}
          onRemove={removePerson}
        />
        <BillsPanel
          bills={state.bills}
          people={state.people}
          onAdd={addBill}
          onUpdate={updateBill}
          onRemove={removeBill}
        />
        <SettlementPanel state={state} />
      </div>

      <footer className="mt-10 text-center text-xs text-muted">
        Tax &amp; service are split in proportion to what each person ordered.
        Don&apos;t know the %? Just enter the total paid.
      </footer>
    </div>
  );
}
