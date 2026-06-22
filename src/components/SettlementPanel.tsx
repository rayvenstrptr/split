import { useMemo, useRef, useState } from 'react';
import type { AppState } from '../types';
import {
  directSettlement,
  netBalances,
  perPersonSummary,
} from '../lib/settle';
import { formatIDR } from '../lib/money';
import { personIndex } from '../lib/colors';
import { Avatar, Button, SectionHead } from './ui';

type Props = { state: AppState };

export default function SettlementPanel({ state }: Props) {
  const [copied, setCopied] = useState(false);
  const [exporting, setExporting] = useState<null | 'png' | 'pdf'>(null);
  const exportRef = useRef<HTMLDivElement>(null);

  const { summary, transfers, byPayer, nameById, balanced } = useMemo(() => {
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
    return { summary, transfers, byPayer, nameById, balanced };
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
      backgroundColor: '#f4f0e8',
      // Pad the capture so the rounded cards aren't flush to the edge.
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
    <section>
      <SectionHead
        title="Who pays whom"
        right={
          <div className="flex items-center gap-1.5">
            <Button variant="secondary" size="sm" onClick={copySummary} disabled={busy}>
              {copied ? 'Copied!' : 'Copy'}
            </Button>
            <Button variant="secondary" size="sm" onClick={exportPng} disabled={busy}>
              {exporting === 'png' ? '…' : 'PNG'}
            </Button>
            <Button variant="secondary" size="sm" onClick={exportPdf} disabled={busy}>
              {exporting === 'pdf' ? '…' : 'PDF'}
            </Button>
          </div>
        }
      />

      <div ref={exportRef} className="bg-transparent">
        {/* Payment cards */}
        <div className="flex flex-col gap-2">
          {transfers.length === 0 && (
            <div className="rounded-card border border-line bg-surface p-5 text-center text-muted">
              Everyone&apos;s settled up.
            </div>
          )}
          {transfers.map((t, i) => (
            <div
              key={i}
              className="flex items-center gap-3 rounded-card border border-line bg-surface px-4 py-3.5 shadow-soft"
            >
              <Avatar
                name={nameById[t.from]}
                index={personIndex(state.people, t.from)}
                size={38}
              />
              <div className="flex flex-1 items-center gap-2 text-sm">
                <strong className="font-bold">{nameById[t.from]}</strong>
                <span className="text-faint">→</span>
                <strong className="font-bold">{nameById[t.to]}</strong>
              </div>
              <Avatar
                name={nameById[t.to]}
                index={personIndex(state.people, t.to)}
                size={38}
              />
              <div className="tnum min-w-[110px] whitespace-nowrap text-right text-base font-extrabold text-accent">
                {formatIDR(t.amount)}
              </div>
            </div>
          ))}
        </div>

        {/* Per-person balances */}
        <SectionHead title="Balances" className="mt-[22px]" />
        <div className="overflow-hidden rounded-card border border-line bg-surface">
          {summary.map((s, i) => (
            <div
              key={s.id}
              className={`flex items-center gap-3 px-4 py-3 ${
                i === 0 ? '' : 'border-t border-line'
              }`}
            >
              <Avatar
                name={nameById[s.id]}
                index={personIndex(state.people, s.id)}
                size={32}
              />
              <span className="flex-1 font-semibold">{nameById[s.id]}</span>
              <div className="text-right">
                <div className="tnum whitespace-nowrap text-[11.5px] text-faint">
                  paid {formatIDR(s.paid)} · spent {formatIDR(s.consumed)}
                </div>
                <div
                  className={`tnum whitespace-nowrap text-sm font-extrabold ${
                    s.net > 0
                      ? 'text-positive'
                      : s.net < 0
                        ? 'text-negative'
                        : 'text-muted'
                  }`}
                >
                  {s.net > 0 ? '+' : ''}
                  {formatIDR(s.net)}
                </div>
              </div>
            </div>
          ))}
        </div>
        <p className="mx-0.5 mt-2.5 text-xs text-muted">
          {balanced
            ? 'Balances check out — paid and shares net to zero.'
            : 'Heads up: balances do not net to zero.'}
        </p>
      </div>
    </section>
  );
}
