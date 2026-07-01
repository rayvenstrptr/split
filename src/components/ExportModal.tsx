import { useEffect, useMemo, useRef, useState } from 'react';
import type { AppState } from '../types';
import {
  directSettlement,
  minimizeTransfers,
  netBalances,
  perPersonSummary,
} from '../lib/settle';
import { formatIDR } from '../lib/money';
import { Button } from './ui';
import ExportSheet from './ExportSheet';

type Props = {
  open: boolean;
  onClose: () => void;
  state: AppState;
  /** Name of the session being exported (for the receipt header). */
  sessionName?: string;
  /** Epoch ms the session was saved (defaults to now). */
  savedAt?: number;
  settlementMode: 'direct' | 'minimize';
};

/**
 * The "Share & export" popup: copy a text summary, or download the monochrome
 * receipt as PNG / PDF. Captured off a hidden, fixed-width `ExportSheet` node so
 * the artifact always matches the on-screen numbers (and the chosen settlement
 * mode). Link sharing is teased here but not built yet.
 */
export default function ExportModal({
  open,
  onClose,
  state,
  sessionName,
  savedAt,
  settlementMode,
}: Props) {
  const [copied, setCopied] = useState(false);
  const [exporting, setExporting] = useState<null | 'png' | 'pdf'>(null);
  // The hidden, fixed-width node the PNG/PDF are captured from.
  const sheetRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const { summary, byPayer, nameById } = useMemo(() => {
    const summary = perPersonSummary(state);
    const transfers =
      settlementMode === 'minimize'
        ? minimizeTransfers(netBalances(state))
        : directSettlement(state);
    const nameById = Object.fromEntries(state.people.map((p) => [p.id, p.name]));
    const byPayer = new Map<string, typeof transfers>();
    for (const t of transfers) {
      const list = byPayer.get(t.from) ?? [];
      list.push(t);
      byPayer.set(t.from, list);
    }
    return { summary, byPayer, nameById };
  }, [state, settlementMode]);

  const copySummary = async () => {
    const lines: string[] = ['*Split Bill — who pays whom*', ''];
    for (const s of summary) {
      const outgoing = byPayer.get(s.id) ?? [];
      if (outgoing.length > 0) {
        lines.push(`*${nameById[s.id]}* pays:`);
        for (const t of outgoing) lines.push(`   → ${nameById[t.to]}: ${formatIDR(t.amount)}`);
      } else if (s.net > 0) {
        lines.push(`*${nameById[s.id]}*: owed ${formatIDR(s.net)} · nothing to pay`);
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
    const node = sheetRef.current;
    if (!node) return null;
    const { toPng } = await import('html-to-image');
    // The node already carries its 24px cream frame (see below), so the torn
    // edge + card shadow have room and nothing is clipped. Capture it at its
    // full measured size — don't inflate the clone with a padding style, which
    // would push content past the canvas edge and slice the right side off.
    return toPng(node, { pixelRatio: 2 });
  };

  const fileBase = () => {
    const slug = (sessionName ?? 'split-bill')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    return `${slug || 'split-bill'}-${new Date(savedAt ?? Date.now()).toISOString().slice(0, 10)}`;
  };

  const exportPng = async () => {
    setExporting('png');
    try {
      const dataUrl = await renderPng();
      if (!dataUrl) return;
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `${fileBase()}.png`;
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
      pdf.save(`${fileBase()}.pdf`);
    } finally {
      setExporting(null);
    }
  };

  if (!open) return null;
  const busy = exporting !== null;

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-ink/30 p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="w-full max-w-[360px] rounded-card bg-surface p-5 shadow-hero"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Share & export"
      >
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="text-base font-extrabold tracking-tight">Share &amp; export</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid h-7 w-7 place-items-center rounded-full text-faint transition-colors hover:bg-surface-2 hover:text-ink"
          >
            ✕
          </button>
        </div>
        <p className="mt-1.5 text-sm leading-relaxed text-muted">
          Copy a text summary or download the receipt as an image or PDF.
        </p>

        <div className="mt-4 grid grid-cols-3 gap-2">
          <Button variant="secondary" onClick={copySummary} disabled={busy}>
            {copied ? 'Copied!' : 'Copy'}
          </Button>
          <Button variant="secondary" onClick={exportPng} disabled={busy}>
            {exporting === 'png' ? '…' : 'PNG'}
          </Button>
          <Button variant="secondary" onClick={exportPdf} disabled={busy}>
            {exporting === 'pdf' ? '…' : 'PDF'}
          </Button>
        </div>

        {/* Teaser for the upcoming link-sharing feature. */}
        <div className="mt-3 flex items-center gap-2.5 rounded-well border border-dashed border-line-strong bg-surface-2 px-3 py-2.5">
          <span aria-hidden className="text-base">🔗</span>
          <div className="min-w-0">
            <div className="text-[13px] font-bold text-ink">Share with a link</div>
            <div className="text-[11.5px] text-muted">Coming soon — send a link instead of a file.</div>
          </div>
        </div>

        {/* Off-screen export artifact — captured by PNG / PDF, never shown.
            The 24px cream frame is part of the captured node (inline-block so it
            shrink-wraps to the sheet width) so html-to-image measures the full
            padded size and nothing clips on the right. */}
        <div aria-hidden style={{ position: 'fixed', left: -100000, top: 0, pointerEvents: 'none' }}>
          <div
            ref={sheetRef}
            style={{ display: 'inline-block', padding: 24, background: '#f4f0e8' }}
          >
            <ExportSheet
              state={state}
              sessionName={sessionName ?? 'Untitled session'}
              savedAt={savedAt}
              settlementMode={settlementMode}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
