const IDR = new Intl.NumberFormat('id-ID', {
  style: 'currency',
  currency: 'IDR',
  maximumFractionDigits: 0,
});

const GROUPED = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 });

/** Format an integer rupiah amount as `Rp 150.000`. */
export function formatIDR(amount: number): string {
  // Intl renders IDR as "Rp 150.000" in id-ID; normalize any non-breaking space.
  return IDR.format(Math.round(amount)).replace(/ /g, ' ');
}

/** Format with thousand separators but no symbol, e.g. `150.000` — for inputs. */
export function groupDigits(amount: number): string {
  if (!Number.isFinite(amount)) return '';
  return GROUPED.format(Math.round(amount));
}

/**
 * Parse loose user input ("150.000", "Rp 150rb", "150000") into integer rupiah.
 * Strips everything except digits, so thousand separators are safely ignored.
 */
export function parseIDR(input: string): number {
  const digits = input.replace(/[^\d]/g, '');
  if (digits === '') return 0;
  return parseInt(digits, 10);
}
