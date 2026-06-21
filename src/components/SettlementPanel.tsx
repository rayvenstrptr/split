import { useMemo, useRef, useState } from 'react';
import type { AppState } from '../types';
import {
  directSettlement,
  netBalances,
  perPersonSummary,
} from '../lib/settle';
import { formatIDR } from '../lib/money';

type Props = { state: AppState };

export default function SettlementPanel({ state }: Props) {
  const [copied, setCopied] = useState(false);
  const [exporting, setExporting] = useState<null | 'png' | 'pdf'>(null);
  const exportRef = useRef<HTMLDivElement>(null);

  const { summary, byPayer, nameById, balanced } = useMemo(() => {
    const summary = perPersonSummary(state);
    const net = netBalances(state);
    const transfers = directSettlement(state);
    const nameById = Object.fromEntries(state.people.map((p) => [p.id, p.name]));
    const byPayer = new Map<string, typeof transfers>();
    for (const t of transfers) {
      const list = byPayer.get(t.from) ?? [];
      list.push(t);
      byPayer.set(t.from, list);
    }
    const balanced =
      Math.abs(Object.values(net).reduce((s, v) => s + v, 0)) < 1;
    return { summary, byPayer, nameById, balanced };
  }, [state]);

  const copySummary = async () => {
    const lines: string[] = ['*Split Bill — who pays whom*', ''];
    for (const s of summary) {
      const outgoing = byPayer.get(s.id) ?? [];
      if (outgoing.length > 0) {
        lines.push(`*${nameById[s.id]}* pays:`);
        for (const t of outgoing) {
          lines.push(`   → ${nameById[t.to]}: ${formatIDR(t.amount)}`);
        }
      } else if (s.net > 0) {
        lines.push(
          `*${nameById[s.id]}*: owed ${formatIDR(s.net)} · nothing to pay`,
        );
      } else {
        lines.push(`*${nameById[s.id]}*: settled up`);
      }
    }
    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

  const renderPng = async () => {
    const node = exportRef.current;
    if (!node) return null;
    const { toPng } = await import('html-to-image');
    return toPng(node, {
      pixelRatio: 2,
      backgroundColor: '#ffffff',
      // Pad the capture so the rounded card isn't flush to the edge.
      style: { padding: '20px' },
    });
  };

  const exportPng = async () => {
    setExporting('png');
    try {
      const dataUrl = await renderPng();
      if (!dataUrl) return;
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `split-bill-${new Date().toISOString().slice(0, 10)}.png`;
      a.click();
    } finally {
      setExporting(null);
    }
  };

  const exportPdf = async () => {
    setExporting('pdf');
    try {
      const dataUrl = await renderPng();
      if (!dataUrl) return;
      const img = new Image();
      img.src = dataUrl;
      await img.decode();
      const { default: jsPDF } = await import('jspdf');
      const pdf = new jsPDF({
        orientation: img.width >= img.height ? 'landscape' : 'portrait',
        unit: 'px',
        format: [img.width, img.height],
      });
      pdf.addImage(dataUrl, 'PNG', 0, 0, img.width, img.height);
      pdf.save(`split-bill-${new Date().toISOString().slice(0, 10)}.pdf`);
    } finally {
      setExporting(null);
    }
  };

  const busy = exporting !== null;

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h2 className="text-base font-semibold">Settlement</h2>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={copySummary}
            disabled={busy}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-ink transition-colors hover:border-accent hover:text-accent disabled:opacity-50"
          >
            {copied ? 'Copied!' : 'Copy summary'}
          </button>
          <button
            type="button"
            onClick={exportPng}
            disabled={busy}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-ink transition-colors hover:border-accent hover:text-accent disabled:opacity-50"
          >
            {exporting === 'png' ? 'Exporting…' : 'PNG'}
          </button>
          <button
            type="button"
            onClick={exportPdf}
            disabled={busy}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-ink transition-colors hover:border-accent hover:text-accent disabled:opacity-50"
          >
            {exporting === 'pdf' ? 'Exporting…' : 'PDF'}
          </button>
        </div>
      </div>

      <div ref={exportRef} className="bg-white">
      {/* Who pays whom — every person listed */}
      <ul className="space-y-2">
        {summary.map((s) => {
          const outgoing = byPayer.get(s.id) ?? [];
          return (
            <li key={s.id} className="rounded-xl bg-gray-50 px-4 py-3">
              <div className="flex items-center gap-2">
                <Avatar
                  name={nameById[s.id]}
                  accent={outgoing.length === 0 && s.net > 0}
                />
                <span className="text-sm font-semibold">{nameById[s.id]}</span>
                {outgoing.length > 0 ? (
                  <span className="text-xs text-muted">pays</span>
                ) : s.net > 0 ? (
                  <span className="ml-auto text-xs font-medium text-positive">
                    owed {formatIDR(s.net)} · nothing to pay
                  </span>
                ) : (
                  <span className="ml-auto text-xs text-muted">settled up</span>
                )}
              </div>
              {outgoing.length > 0 && (
                <ul className="mt-2 space-y-1.5 pl-2">
                  {outgoing.map((t, i) => (
                    <li
                      key={i}
                      className="flex items-center justify-between"
                    >
                      <span className="flex items-center gap-2 text-sm">
                        <span className="text-muted">→</span>
                        <Avatar name={nameById[t.to]} />
                        <span className="font-medium">{nameById[t.to]}</span>
                      </span>
                      <span className="tnum font-semibold text-ink">
                        {formatIDR(t.amount)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>

      {/* Per-person balances */}
      <div className="mt-5">
        <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">
          Balances
        </h3>
        <div className="overflow-hidden rounded-xl border border-gray-200">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-muted">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Person</th>
                <th className="px-3 py-2 text-right font-medium">Paid</th>
                <th className="px-3 py-2 text-right font-medium">Spending</th>
                <th className="px-3 py-2 text-right font-medium">Net</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {summary.map((s) => (
                <tr key={s.id}>
                  <td className="px-3 py-2 font-medium">{nameById[s.id]}</td>
                  <td className="tnum px-3 py-2 text-right text-muted">
                    {formatIDR(s.paid)}
                  </td>
                  <td className="tnum px-3 py-2 text-right text-muted">
                    {formatIDR(s.consumed)}
                  </td>
                  <td
                    className={`tnum px-3 py-2 text-right font-semibold ${
                      s.net > 0
                        ? 'text-positive'
                        : s.net < 0
                          ? 'text-negative'
                          : 'text-muted'
                    }`}
                  >
                    {s.net > 0 ? '+' : ''}
                    {formatIDR(s.net)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-muted">
          {balanced
            ? 'Balances check out — paid and shares net to zero.'
            : 'Heads up: balances do not net to zero.'}
        </p>
      </div>
      </div>
    </section>
  );
}

function Avatar({ name, accent }: { name: string; accent?: boolean }) {
  return (
    <span
      className={`grid h-7 w-7 place-items-center rounded-full text-xs font-semibold ${
        accent ? 'bg-accent text-white' : 'bg-gray-200 text-ink'
      }`}
    >
      {name.slice(0, 2)}
    </span>
  );
}
