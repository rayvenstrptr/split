import type { ActivityEvent, ActivityKind } from '../types';
import { formatRelative, formatDateTime } from '../lib/date';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { Button } from './ui';

type Props = {
  events: ActivityEvent[];
  onClear: () => void;
  onDownloadArchive: () => void;
};

/** Dot color per kind — drawn from the on-brand person palette in colors.ts. */
const DOT: Record<ActivityKind, string> = {
  session: '#0F8A6E', // emerald
  bill: '#E0824A', // terracotta
  person: '#3E6DB5', // indigo
  cloud: '#9B5BA8', // plum
  edit: '#C99A2E', // gold
  backup: '#5A8A4C', // olive
  system: '#97A19B', // faint
};

/** Cap the rendered rows so a near-full log (up to 500) stays snappy. */
const DISPLAY = 150;

export default function ActivityPanel({
  events,
  onClear,
  onDownloadArchive,
}: Props) {
  const [collapsed, setCollapsed] = useLocalStorage(
    'split-bill-id/activity-collapsed/v1',
    true,
  );

  const shown = events.slice(0, DISPLAY);
  const hidden = events.length - shown.length;

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
          <span className="text-base font-extrabold tracking-tight">Activity</span>
        </span>
        <span className="whitespace-nowrap text-xs font-semibold text-muted">
          {events.length === 0
            ? 'Nothing logged yet'
            : `${events.length} ${events.length === 1 ? 'entry' : 'entries'}`}
        </span>
      </button>

      {collapsed ? null : (
        <>
          {events.length === 0 ? (
            <p className="mx-0.5 text-sm text-muted">
              Actions you take — adding people, editing stops, saving, syncing — show up
              here.
            </p>
          ) : (
            <ul className="flex flex-col gap-0.5">
              {shown.map((e) => (
                <li
                  key={e.id}
                  className="flex items-center gap-2.5 rounded-well px-2 py-1.5 hover:bg-surface-2"
                >
                  <span
                    aria-hidden
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ background: DOT[e.kind] }}
                  />
                  <span className="min-w-0 flex-1 truncate text-[13px] text-ink">
                    {e.message}
                  </span>
                  <span
                    className="shrink-0 text-[11px] text-faint"
                    title={formatDateTime(e.at)}
                  >
                    {formatRelative(e.at)}
                  </span>
                </li>
              ))}
            </ul>
          )}

          {hidden > 0 && (
            <p className="mx-0.5 mt-2 text-xs text-muted">
              + {hidden} older — download the archive to see everything.
            </p>
          )}

          <div className="mt-3.5 flex gap-2">
            <Button
              variant="secondary"
              onClick={onDownloadArchive}
              title="Save the full activity archive to a file"
              className="flex-1"
            >
              ↓ Download archive
            </Button>
            <Button
              variant="secondary"
              onClick={onClear}
              disabled={events.length === 0}
              title="Clear the list shown here (the archive is kept)"
              className="flex-1"
            >
              Clear list
            </Button>
          </div>
          <p className="mx-0.5 mt-2.5 text-xs text-muted">
            Recent activity on this device. Older entries roll into the archive (kept in
            the cloud when you’re signed in); clearing here doesn’t erase it.
          </p>
        </>
      )}
    </section>
  );
}
