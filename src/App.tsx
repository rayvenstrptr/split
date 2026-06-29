import { useEffect, useRef, useState } from 'react';
import type { ActivityEvent, AppState, Bill, Person, SavedSession } from './types';
import {
  useLocalStorage,
  readStored,
  writeStored,
} from './hooks/useLocalStorage';
import { useUndoableState } from './hooks/useUndoableState';
import { useActivityLog } from './hooks/useActivityLog';
import { sampleState } from './data/sample';
import { uid } from './lib/id';
import { formatDate } from './lib/date';
import { moveItem } from './lib/reorder';
import {
  buildBackup,
  downloadJSON,
  parseBackup,
  mergeSessions,
  slugify,
  fileDate,
} from './lib/backup';
import {
  cloudConfigured,
  normalizeUsername,
  isCloudError,
  claim,
  pull,
  push,
  appendActivity,
  pullActivity,
} from './lib/cloud';
import { mergeEvents } from './lib/activity';
import HistoryPanel from './components/HistoryPanel';
import CloudSyncPanel, { type SyncStatus } from './components/CloudSyncPanel';
import PeoplePanel from './components/PeoplePanel';
import BillsPanel from './components/BillsPanel';
import SettlementPanel from './components/SettlementPanel';
import ActivityPanel from './components/ActivityPanel';
import { Button } from './components/ui';
import { billShares, perPersonSummary, directSettlement } from './lib/settle';
import { formatIDR } from './lib/money';

const STORAGE_KEY = 'split-bill-id/v1'; // current working state
const HISTORY_KEY = 'split-bill-id/history/v1'; // saved sessions
const NAME_KEY = 'split-bill-id/session-name/v1';
const CURRENT_ID_KEY = 'split-bill-id/session-id/v1';
const ACCOUNT_KEY = 'split-bill-id/account/v1'; // cloud-sync credentials

/** Cloud-sync identity. PIN is cached locally so auto-push can run silently. */
type Account = { username: string; pin: string };

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
  const [account, setAccount] = useLocalStorage<Account | null>(
    ACCOUNT_KEY,
    null,
  );
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle');
  const {
    events: activity,
    pending,
    log,
    mergeIn,
    dropPending,
    clear: clearActivity,
  } = useActivityLog();

  // Persist the working state (the undo stacks themselves stay in memory).
  useEffect(() => {
    writeStored(STORAGE_KEY, state);
  }, [state]);

  // Cross-device sync: while logged in, push history to the cloud after edits.
  // The push is a read-merge-write (union cloud + local) so it never clobbers a
  // newer session from another device. We skip the initial mount so reopening the
  // app doesn't fire a needless round-trip, and we deliberately do NOT update the
  // local list here — pulling another device's sessions into view is the "Sync now"
  // button's job, keeping the current screen stable while you work.
  const firstSync = useRef(true);
  useEffect(() => {
    if (firstSync.current) {
      firstSync.current = false;
      return;
    }
    if (!account) return;
    setSyncStatus('syncing');
    const t = setTimeout(() => {
      pull(account.username, account.pin)
        .then((cloud) =>
          push(account.username, account.pin, mergeSessions(cloud, history).merged),
        )
        .then(() => setSyncStatus('synced'))
        .catch(() => setSyncStatus('error'));
    }, 800);
    return () => clearTimeout(t);
  }, [history, account]);

  // Activity archive upload: while logged in, append new events + any pending roll-offs
  // to the durable `activity_events` table (debounced). `uploadedAt` is a watermark so we
  // re-send only fresh/bumped active events, while `pending` is always flushed in full.
  // Failures (incl. the table not existing before the migration is run) are swallowed so
  // the app keeps working offline; the events stay local and retry on the next change.
  const firstActivitySync = useRef(true);
  const uploadedAt = useRef(0);
  useEffect(() => {
    if (firstActivitySync.current) {
      firstActivitySync.current = false;
      if (pending.length === 0) return; // mere reopen, nothing waiting — skip
    }
    if (!account) return;
    const t = setTimeout(() => {
      const fresh = activity.filter((e) => e.at > uploadedAt.current);
      const batch = [...pending, ...fresh];
      if (batch.length === 0) return;
      const pendingIds = pending.map((e) => e.id);
      const maxAt = batch.reduce((m, e) => Math.max(m, e.at), uploadedAt.current);
      appendActivity(account.username, account.pin, batch)
        .then(() => {
          uploadedAt.current = maxAt;
          dropPending(pendingIds);
        })
        .catch(() => {
          /* keep pending; retried on the next change */
        });
    }, 1200);
    return () => clearTimeout(t);
  }, [activity, pending, account, dropPending]);

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
    log('person', `Added ${name}`);
  };

  const removePerson = (id: string) => {
    const person = state.people.find((p) => p.id === id);
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
    log('person', `Removed ${person?.name ?? 'someone'}`);
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
    log('bill', `Added stop "${newBill.name}"`);
  };

  const updateBill = (bill: Bill) => {
    setState((s) => ({
      ...s,
      bills: s.bills.map((b) => (b.id === bill.id ? bill : b)),
    }));
    log('edit', `Edited "${bill.name}"`, bill.id);
  };

  const removeBill = (id: string) => {
    const bill = state.bills.find((b) => b.id === id);
    setState((s) => ({ ...s, bills: s.bills.filter((b) => b.id !== id) }));
    log('bill', `Deleted "${bill?.name ?? 'a stop'}"`);
  };

  const reorderBills = (from: number, to: number) => {
    setState((s) => ({ ...s, bills: moveItem(s.bills, from, to) }));
    log('edit', 'Reordered stops', 'reorder-bills');
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
      log('session', `Updated "${name}"`);
    } else {
      const id = uid('s_');
      setCurrentId(id);
      setHistory([{ id, name, savedAt: now, state: snapshot }, ...history]);
      log('session', `Saved "${name}"`);
    }
    setSessionName(name);
  };

  const loadSession = (id: string) => {
    const session = history.find((s) => s.id === id);
    if (!session || session.id === currentId) {
      if (session) {
        setState(structuredClone(session.state));
        setSessionName(session.name);
        log('session', `Loaded "${session.name}"`);
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
    log('session', `Loaded "${session.name}"`);
  };

  const deleteSession = (id: string) => {
    const session = history.find((s) => s.id === id);
    if (!confirm(`Delete saved session "${session?.name ?? ''}"?`)) return;
    setHistory(history.filter((s) => s.id !== id));
    if (currentId === id) setCurrentId(null);
    log('session', `Deleted session "${session?.name ?? ''}"`);
  };

  const newSession = () => {
    // Keep the same people (you usually go out with the same crew), clear bills.
    setState((s) => ({ people: s.people, bills: [] }));
    setSessionName('');
    setCurrentId(null);
    log('session', 'Started a new session');
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
    log('session', 'Loaded the example day');
  };

  /* ---- Backup / restore (durable, file-based) ---- */
  const exportAllSessions = () => {
    if (history.length === 0) return;
    downloadJSON(`split-bill-sessions-${fileDate()}.json`, buildBackup(history));
    log('backup', `Backed up ${history.length} session(s)`);
  };

  const exportSession = (id: string) => {
    const session = history.find((s) => s.id === id);
    if (!session) return;
    downloadJSON(
      `split-bill-${slugify(session.name)}-${fileDate(session.savedAt)}.json`,
      buildBackup([session]),
    );
    log('backup', `Exported "${session.name}"`);
  };

  const importSessionsText = (text: string) => {
    try {
      const incoming = parseBackup(text);
      const { merged, added, updated } = mergeSessions(history, incoming);
      setHistory(merged);
      log('backup', `Restored ${incoming.length} session(s)`);
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

  /* ---- Cloud sync (optional, username + 4-digit PIN) ---- */
  const cloudCreate = async (
    username: string,
    pin: string,
  ): Promise<string | null> => {
    const uname = normalizeUsername(username);
    try {
      await claim(uname, pin, history);
      setAccount({ username: uname, pin });
      setSyncStatus('synced');
      log('cloud', `Created account @${uname}`);
      return null;
    } catch (e) {
      setSyncStatus('error');
      return cloudErrorMessage(e, 'create');
    }
  };

  const cloudLogin = async (
    username: string,
    pin: string,
  ): Promise<string | null> => {
    const uname = normalizeUsername(username);
    try {
      const pulled = await pull(uname, pin);
      setHistory(mergeSessions(history, pulled).merged);
      setAccount({ username: uname, pin });
      setSyncStatus('synced');
      // Bring this account's recent activity onto the device (best-effort: a missing
      // activity table, before the migration is run, must not fail the login).
      pullActivity(uname, pin, 500)
        .then(mergeIn)
        .catch(() => {});
      log('cloud', `Logged in as @${uname}`);
      return null;
    } catch (e) {
      setSyncStatus('error');
      return cloudErrorMessage(e, 'login');
    }
  };

  const cloudSyncNow = () => {
    if (!account) return;
    setSyncStatus('syncing');
    Promise.all([
      pull(account.username, account.pin),
      pullActivity(account.username, account.pin, 500).catch(
        () => [] as ActivityEvent[],
      ),
    ])
      .then(([pulled, acts]) => {
        setHistory(mergeSessions(history, pulled).merged);
        mergeIn(acts);
        setSyncStatus('synced');
      })
      .catch(() => setSyncStatus('error'));
  };

  const cloudLogout = () => {
    log('cloud', 'Logged out');
    setAccount(null);
    setSyncStatus('idle');
  };

  /* ---- Activity archive (download the full kept history as one file) ---- */
  const downloadActivityArchive = async () => {
    let server: ActivityEvent[] = [];
    if (account) {
      try {
        // Page back through the server archive, newest first, until a short page.
        let before: number | undefined;
        for (let i = 0; i < 200; i++) {
          const page = await pullActivity(account.username, account.pin, 500, before);
          server = server.concat(page);
          if (page.length < 500) break;
          before = page[page.length - 1].at;
        }
      } catch {
        /* offline / not migrated — fall back to whatever is local */
      }
    }
    const all = mergeEvents(mergeEvents(server, pending), activity);
    if (all.length === 0) {
      alert('No activity to archive yet.');
      return;
    }
    downloadJSON(`split-bill-activity-${fileDate()}.json`, {
      app: 'split-bill-id',
      kind: 'activity-archive',
      version: 1,
      exportedAt: Date.now(),
      events: all,
    });
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
        {cloudConfigured() && (
          <CloudSyncPanel
            account={account ? { username: account.username } : null}
            syncStatus={syncStatus}
            onLogin={cloudLogin}
            onCreate={cloudCreate}
            onSyncNow={cloudSyncNow}
            onLogout={cloudLogout}
          />
        )}
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
        <ActivityPanel
          events={activity}
          onClear={() => {
            if (confirm('Clear the activity list shown here? The archive is kept.')) {
              clearActivity();
            }
          }}
          onDownloadArchive={downloadActivityArchive}
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

/** Map a thrown cloud error to friendly copy for the login/create form. */
function cloudErrorMessage(e: unknown, ctx: 'login' | 'create'): string {
  if (isCloudError(e)) {
    if (e === 'username_taken') {
      return 'That name is taken — log in if it’s yours, or pick another.';
    }
    if (e === 'invalid_credentials') {
      return ctx === 'login'
        ? 'Wrong username or code.'
        : 'Enter a username and a 4-digit code.';
    }
    return 'Couldn’t reach the cloud. Check your connection and try again.';
  }
  return 'Something went wrong. Please try again.';
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
