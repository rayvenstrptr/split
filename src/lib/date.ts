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
