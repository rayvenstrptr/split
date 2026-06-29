const DATE_TIME = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

const DATE = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
});

/** e.g. "21 Jun 2026, 11:30" */
export const formatDateTime = (ms: number): string => DATE_TIME.format(ms);

/** e.g. "21 Jun 2026" */
export const formatDate = (ms: number): string => DATE.format(ms);

/** Compact "time ago" for the activity log; falls back to a date past a week. */
export const formatRelative = (ms: number, now = Date.now()): string => {
  const s = Math.round((now - ms) / 1000);
  if (s < 45) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 7) return `${d}d ago`;
  return formatDate(ms);
};
