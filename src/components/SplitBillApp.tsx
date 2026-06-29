import { useEffect } from 'react';
import type { AppState, Bill, Person, SavedSession } from '../types';
import {
  useLocalStorage,
  readStored,
  writeStored,
} from '../hooks/useLocalStorage';
import { useUndoableState } from '../hooks/useUndoableState';
import { sampleState } from '../data/sample';
import { uid } from '../lib/id';
import { formatDate } from '../lib/date';
import { moveItem } from '../lib/reorder';
import {
  buildBackup,
  downloadJSON,
  parseBackup,
  mergeSessions,
  slugify,
  fileDate,
} from '../lib/backup';
import HistoryPanel from './HistoryPanel';
import PeoplePanel from './PeoplePanel';
import BillsPanel from './BillsPanel';
import SettlementPanel from './SettlementPanel';
import { Button } from './ui';
import { billShares, perPersonSummary, directSettlement } from '../lib/settle';
import { formatIDR } from '../lib/money';

/** The current working `AppState` lives here; the Spin Wheel reads it to import people. */
export const WORKING_STATE_KEY = 'split-bill-id/v1'; // current working state
const NAME_KEY = 'split-bill-id/session-name/v1';
const CURRENT_ID_KEY = 'split-bill-id/session-id/v1';

type Props = {
  onOpenMenu: () => void;
  /** Saved sessions live in the shell (App) so the sidebar can host the login. */
  history: SavedSession[];
  setHistory: (next: SavedSession[]) => void;
};

export default function SplitBillApp({
  onOpenMenu,
  history,
  setHistory,
}: Props) {
  const { state, setState, undo, redo, canUndo, canRedo } =
    useUndoableState<AppState>(readStored(WORKING_STATE_KEY, sampleState), {
      coalesceMs: 400,
    });
  const [sessionName, setSessionName] = useLocalStorage<string>(NAME_KEY, '');
  const [currentId, setCurrentId] = useLocalStorage<string | null>(
    CURRENT_ID_KEY,
    null,
  );

  // Persist the working state (the undo stacks themselves stay in memory).
  useEffect(() => {
    writeStored(WORKING_STATE_KEY, state);
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
      (b) =>
        b.payerId === id ||
        b.entries.some((e) => e.personId === id) ||
        b.items?.some((it) => it.ownerIds.includes(id)),
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
        items: b.items?.map((it) => ({
          ...it,
          ownerIds: it.ownerIds.filter((o) => o !== id),
        })),
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

  const reorderBills = (from: number, to: number) => {
    setState((s) => ({ ...s, bills: moveItem(s.bills, from, to) }));
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

  /* ---- Derived totals for the summary hero ---- */
  const summary = perPersonSummary(state);
  const transfers = directSettlement(state);
  const totalSpend = state.bills.reduce(
    (sum, b) => sum + billShares(b).total,
    0,
  );

  return (
    <div className="mx-auto min-h-full max-w-[600px] px-4 pb-[72px] pt-7">
      <header className="mb-5 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={onOpenMenu}
            aria-label="Open menu"
            title="Switch app"
            className="grid h-[34px] w-[34px] place-items-center rounded-[11px] border border-line-strong bg-surface text-ink transition-colors hover:border-accent hover:text-accent"
          >
            <span className="text-[15px] leading-none">☰</span>
          </button>
          <span
            className="grid h-[34px] w-[34px] place-items-center rounded-[11px] bg-accent text-[18px] font-extrabold text-white"
            style={{ transform: 'rotate(-6deg)' }}
            aria-hidden
          >
            S
          </span>
          <div className="text-[19px] font-extrabold tracking-tight">
            Split<span className="text-terracotta">.</span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <Button
            variant="secondary"
            size="sm"
            onClick={undo}
            disabled={!canUndo}
            title="Undo (⌘Z)"
          >
            ↶ Undo
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={redo}
            disabled={!canRedo}
            title="Redo (⌘⇧Z)"
          >
            ↷ Redo
          </Button>
        </div>
      </header>

      {/* Summary hero */}
      <div
        className="relative mb-[22px] overflow-hidden rounded-hero p-[22px] text-white shadow-hero"
        style={{ background: 'linear-gradient(135deg, #11806A 0%, #0B6B55 100%)' }}
      >
        <div
          className="absolute -right-10 -top-10 h-40 w-40 rounded-full"
          style={{ background: 'rgba(224,130,74,0.30)', filter: 'blur(8px)' }}
          aria-hidden
        />
        <input
          value={sessionName}
          onChange={(e) => setSessionName(e.target.value)}
          placeholder="Name this occasion"
          aria-label="Session name"
          className="relative w-[70%] border-0 bg-transparent p-0 text-[13px] font-semibold text-white/85 outline-none placeholder:text-white/60"
        />
        <div className="tnum relative my-0.5 text-[40px] font-extrabold leading-none tracking-tight">
          {formatIDR(totalSpend)}
        </div>
        <div className="relative mb-4 text-[13px] text-white/80">
          spent across the day
        </div>
        <div className="relative flex gap-2.5">
          <Stat label="Stops" value={state.bills.length} />
          <Stat label="People" value={state.people.length} />
          <Stat label="Payments to settle" value={transfers.length} />
        </div>
      </div>

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
          summary={summary}
          onAdd={addPerson}
          onRemove={removePerson}
        />
        <BillsPanel
          bills={state.bills}
          people={state.people}
          onAdd={addBill}
          onUpdate={updateBill}
          onRemove={removeBill}
          onReorder={reorderBills}
        />
        <SettlementPanel
          state={state}
          sessionName={sessionName.trim() || undefined}
          savedAt={history.find((s) => s.id === currentId)?.savedAt}
        />
      </div>

      <footer className="mt-9 text-center text-xs leading-relaxed text-muted">
        Tax &amp; service are split in proportion to what each person ordered.
        <br />
        Don&apos;t know the %? Just enter the total paid.
      </footer>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div
      className="flex-1 rounded-well px-3 py-2.5"
      style={{ background: 'rgba(255,255,255,0.12)' }}
    >
      <div className="tnum text-[22px] font-extrabold leading-none">{value}</div>
      <div className="mt-1 text-[11px] text-white/80">{label}</div>
    </div>
  );
}
