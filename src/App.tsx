import { useEffect, useRef, useState } from 'react';
import type { SavedSession } from './types';
import { useLocalStorage } from './hooks/useLocalStorage';
import {
  cloudConfigured,
  normalizeUsername,
  isCloudError,
  claim,
  pull,
  push,
} from './lib/cloud';
import { mergeSessions } from './lib/backup';
import Sidebar, { type ActiveApp } from './components/Sidebar';
import SplitBillApp from './components/SplitBillApp';
import SpinWheelApp from './components/SpinWheelApp';
import { type SyncStatus } from './components/CloudSyncPanel';

const ACTIVE_APP_KEY = 'split-bill-id/active-app/v1';
const HISTORY_KEY = 'split-bill-id/history/v1'; // saved sessions
const ACCOUNT_KEY = 'split-bill-id/account/v1'; // cloud-sync credentials

/** Cloud-sync identity. PIN is cached locally so auto-push can run silently. */
type Account = { username: string; pin: string };

/**
 * Thin shell: a slide-out sidebar switches between the two mini-apps. The cloud
 * account and the saved sessions live here (above the app switch) so the login
 * can sit in the shared sidebar and survive switching apps.
 */
export default function App() {
  const [activeApp, setActiveApp] = useLocalStorage<ActiveApp>(
    ACTIVE_APP_KEY,
    'split',
  );
  const [menuOpen, setMenuOpen] = useState(false);

  const [history, setHistory] = useLocalStorage<SavedSession[]>(HISTORY_KEY, []);
  const [account, setAccount] = useLocalStorage<Account | null>(
    ACCOUNT_KEY,
    null,
  );
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle');

  const select = (app: ActiveApp) => {
    setActiveApp(app);
    setMenuOpen(false);
  };

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
      return null;
    } catch (e) {
      setSyncStatus('error');
      return cloudErrorMessage(e, 'login');
    }
  };

  const cloudSyncNow = () => {
    if (!account) return;
    setSyncStatus('syncing');
    pull(account.username, account.pin)
      .then((pulled) => {
        setHistory(mergeSessions(history, pulled).merged);
        setSyncStatus('synced');
      })
      .catch(() => setSyncStatus('error'));
  };

  const cloudLogout = () => {
    setAccount(null);
    setSyncStatus('idle');
  };

  return (
    <>
      <Sidebar
        open={menuOpen}
        active={activeApp}
        onSelect={select}
        onClose={() => setMenuOpen(false)}
        cloud={
          cloudConfigured()
            ? {
                account: account ? { username: account.username } : null,
                syncStatus,
                onLogin: cloudLogin,
                onCreate: cloudCreate,
                onSyncNow: cloudSyncNow,
                onLogout: cloudLogout,
              }
            : null
        }
      />
      {activeApp === 'split' ? (
        <SplitBillApp
          onOpenMenu={() => setMenuOpen(true)}
          history={history}
          setHistory={setHistory}
        />
      ) : (
        <SpinWheelApp onOpenMenu={() => setMenuOpen(true)} />
      )}
    </>
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
