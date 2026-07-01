import { useMemo } from 'react';
import type { AppState } from '../types';
import {
  billShares,
  directSettlement,
  minimizeTransfers,
  netBalances,
  perPersonSummary,
  resolveEntries,
} from '../lib/settle';
import { formatIDR } from '../lib/money';
import { personIndex } from '../lib/colors';

/**
 * Print/share sheet for a whole session — the artifact behind the PNG / PDF
 * export. A tall "receipt" strip: header (session name, who's in, timestamp,
 * total spent), who-pays-whom, every bill with its full per-person breakdown
 * and tax/service, per-person balances, and a friendly footer.
 *
 * Everything is computed from `state` through the same settle.ts logic the app
 * uses, so the sheet can never disagree with the on-screen numbers.
 *
 * The look is a warm-grey monochrome ramp (no black); balances read by sign
 * (owes = darker grey, gets back = lighter grey).
 */

type Props = {
  state: AppState;
  sessionName?: string;
  savedAt?: number; // epoch ms
  settlementMode?: 'direct' | 'minimize';
  paper?: 'cream' | 'white';
  showBreakdown?: boolean;
  /** Fixed render width in px. The export captures at this width. */
  width?: number;
};

const MONO_RAMP = ['#5a665f', '#6f7b74', '#86908a', '#9da59f'];
const MONO = '#fffdf9';

export default function ExportSheet({
  state,
  sessionName = 'Untitled session',
  savedAt = Date.now(),
  settlementMode = 'direct',
  paper: paperTone = 'cream',
  showBreakdown = true,
  width = 420,
}: Props) {
  const paper = paperTone === 'white' ? '#ffffff' : '#fffdf9';

  // Warm-grey monochrome palette (no black).
  const ink = '#67736c';
  const shareAmt = '#5f6b64';
  const totalColor = '#67736c';
  const transferAmt = '#67736c';
  const rule = '#cdbfa3';
  const faint = '#a89e85';
  const meta = '#97a19b';
  const muted = '#6e7b75';
  const dotRule = 'rgba(27,43,39,.13)';
  const monoFont = "'Space Mono', ui-monospace, monospace";

  const toneOf = (id: string) =>
    MONO_RAMP[personIndex(state.people, id) % MONO_RAMP.length];

  const view = useMemo(() => {
    const nameById = Object.fromEntries(state.people.map((p) => [p.id, p.name]));
    const signed = (n: number) =>
      (n > 0 ? '+' : n < 0 ? '−' : '') + formatIDR(Math.abs(n));

    const rawTransfers =
      settlementMode === 'minimize'
        ? minimizeTransfers(netBalances(state))
        : directSettlement(state);
    const transfers = rawTransfers.map((t) => ({
      from: nameById[t.from],
      to: nameById[t.to],
      fromTone: toneOf(t.from),
      amount: formatIDR(t.amount),
    }));

    const bills = state.bills.map((bill) => {
      const r = billShares(bill);
      const ents = resolveEntries(bill);
      const shares = ents.map((e) => ({
        name: nameById[e.personId],
        tone: toneOf(e.personId),
        amount: formatIDR(r.perPerson[e.personId] ?? 0),
      }));
      const hasSurcharge =
        bill.mode === 'fromPercent'
          ? (bill.servicePercent ?? 0) > 0 || (bill.taxPercent ?? 0) > 0
          : r.surcharge > 0;
      const hasDiscount = r.discount > 0;
      // With neither a surcharge nor a discount the total *is* the subtotal, and
      // it already prints in the bill's header — skip the redundant breakdown.
      const metaRows: { label: string; value: string }[] = [];
      if (hasSurcharge || hasDiscount) {
        metaRows.push({ label: 'Subtotal', value: formatIDR(r.subtotal) });
        if (hasDiscount) {
          metaRows.push({ label: 'Discount', value: '− ' + formatIDR(r.discount) });
        }
        if (bill.mode === 'fromPercent') {
          metaRows.push({ label: `Service · ${bill.servicePercent ?? 0}%`, value: '+ ' + formatIDR(r.service) });
          metaRows.push({ label: `Tax · ${bill.taxPercent ?? 0}%`, value: '+ ' + formatIDR(r.tax) });
        } else {
          metaRows.push({
            label: 'Tax + service',
            value: `+ ${formatIDR(r.surcharge)} · ${r.effectiveSurchargePct.toFixed(1)}%`,
          });
        }
      }
      return {
        name: bill.name,
        payer: nameById[bill.payerId],
        total: formatIDR(r.total),
        modeLabel: bill.mode === 'fromPercent' ? 'Tax & service %' : 'Total known',
        count: `${ents.length} ordered`,
        shares,
        meta: metaRows,
      };
    });

    const balances = perPersonSummary(state).map((s) => ({
      name: nameById[s.id],
      tone: toneOf(s.id),
      paid: formatIDR(s.paid),
      spent: formatIDR(s.consumed),
      net: signed(s.net),
      status: s.net > 0 ? 'gets back' : s.net < 0 ? 'owes' : 'settled',
      netColor: s.net < 0 ? '#67736c' : s.net > 0 ? '#aab2ac' : '#828c86',
    }));

    const totalSpent = state.bills.reduce((sum, b) => sum + billShares(b).total, 0);
    return { transfers, bills, balances, totalSpent: formatIDR(totalSpent) };
  }, [state, settlementMode]);

  const d = new Date(savedAt);
  const dateStr =
    new Intl.DateTimeFormat('en-GB', {
      weekday: 'short',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }).format(d) +
    ' · ' +
    new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false }).format(d);
  const pad = (n: number) => String(n).padStart(2, '0');
  const refNo = `SPLIT-${pad(d.getMonth() + 1)}${pad(d.getDate())}`;

  const Avatar = ({ name, tone, size }: { name: string; tone: string; size: number }) => (
    <span
      style={{
        display: 'inline-grid',
        placeItems: 'center',
        width: size,
        height: size,
        borderRadius: 999,
        color: MONO,
        fontWeight: 700,
        fontSize: Math.round(size * 0.42),
        background: tone,
      }}
    >
      {name.slice(0, 2)}
    </span>
  );

  const Section = ({ label }: { label: string }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '22px 0 6px' }}>
      <span style={{ flex: 1, borderTop: `1px dashed ${rule}` }} />
      <span
        style={{
          fontFamily: monoFont,
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: '.18em',
          textTransform: 'uppercase',
          color: muted,
        }}
      >
        {label}
      </span>
      <span style={{ flex: 1, borderTop: `1px dashed ${rule}` }} />
    </div>
  );

  return (
    <div style={{ width, fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif" }}>
      <div
        style={{
          background: paper,
          padding: '28px 24px 24px',
          borderRadius: '4px 4px 0 0',
          boxShadow: '0 20px 44px -14px rgba(27,43,39,.26)',
        }}
      >
        {/* Header */}
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontFamily: monoFont, fontSize: 10, letterSpacing: '.30em', color: faint, textTransform: 'uppercase' }}>
            Split &middot; Receipt
          </div>
          <h1 style={{ margin: '9px 0 0', fontSize: 25, fontWeight: 800, letterSpacing: '-.015em', color: ink }}>
            {sessionName}
          </h1>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 5, marginTop: 13 }}>
            {state.people.map((p) => (
              <Avatar key={p.id} name={p.name} tone={toneOf(p.id)} size={28} />
            ))}
          </div>
          <div style={{ fontFamily: monoFont, fontSize: 11, color: muted, marginTop: 11 }}>{dateStr}</div>
          <div style={{ marginTop: 18 }}>
            <div style={{ fontFamily: monoFont, fontSize: 10, letterSpacing: '.20em', color: faint, textTransform: 'uppercase' }}>
              Total spent today
            </div>
            <div
              style={{
                fontSize: 34,
                fontWeight: 800,
                color: totalColor,
                letterSpacing: '-.02em',
                fontVariantNumeric: 'tabular-nums',
                lineHeight: 1.1,
                marginTop: 4,
              }}
            >
              {view.totalSpent}
            </div>
            <div style={{ fontSize: 11.5, color: meta, marginTop: 2 }}>
              {state.bills.length} stops &middot; {state.people.length} people
            </div>
          </div>
        </div>

        {/* Who pays whom */}
        <Section label="Who pays whom" />
        {view.transfers.length === 0 && (
          <div style={{ textAlign: 'center', color: meta, fontSize: 13, padding: '10px 0' }}>
            Everyone&rsquo;s settled up.
          </div>
        )}
        {view.transfers.map((t, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 1px', borderBottom: `1px dotted ${dotRule}` }}>
            <Avatar name={t.from} tone={t.fromTone} size={22} />
            <span style={{ fontWeight: 700, color: ink, fontSize: 13.5 }}>{t.from}</span>
            <span style={{ color: faint, fontSize: 13 }}>&rarr;</span>
            <span style={{ fontWeight: 700, color: ink, fontSize: 13.5 }}>{t.to}</span>
            <span style={{ flex: 1, borderBottom: '1px dotted rgba(27,43,39,.24)', height: 1, margin: '0 2px' }} />
            <span style={{ fontWeight: 800, color: transferAmt, fontSize: 14, fontVariantNumeric: 'tabular-nums' }}>{t.amount}</span>
          </div>
        ))}

        {/* The bills */}
        <Section label="The bills" />
        {view.bills.map((bill, i) => (
          <div key={i} style={{ padding: '13px 0 5px', borderBottom: `1px dotted ${dotRule}` }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
              <span style={{ fontWeight: 800, fontSize: 15, color: ink }}>{bill.name}</span>
              <span style={{ fontWeight: 800, fontSize: 15, color: ink, fontVariantNumeric: 'tabular-nums' }}>{bill.total}</span>
            </div>
            <div style={{ fontFamily: monoFont, fontSize: 10, color: faint, marginTop: 3, textTransform: 'uppercase', letterSpacing: '.05em' }}>
              paid by {bill.payer} &middot; {bill.modeLabel}
            </div>
            {showBreakdown && (
              <div style={{ marginTop: 9 }}>
                {bill.shares.map((s, j) => (
                  <div key={j} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '3px 0' }}>
                    <Avatar name={s.name} tone={s.tone} size={18} />
                    <span style={{ fontSize: 12.5, color: ink, fontWeight: 600 }}>{s.name}</span>
                    <span style={{ flex: 1, borderBottom: '1px dotted rgba(27,43,39,.18)', height: 1 }} />
                    <span style={{ fontSize: 12.5, color: shareAmt, fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{s.amount}</span>
                  </div>
                ))}
                <div style={{ marginTop: 7, paddingTop: 7, borderTop: '1px dotted rgba(27,43,39,.12)' }}>
                  {bill.meta.map((m, j) => (
                    <div key={j} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: meta, padding: '1.5px 0' }}>
                      <span>{m.label}</span>
                      <span style={{ fontVariantNumeric: 'tabular-nums' }}>{m.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}

        {/* Balances */}
        <Section label="Balances" />
        {view.balances.map((b, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '9px 1px', borderBottom: `1px dotted ${dotRule}` }}>
            <Avatar name={b.name} tone={b.tone} size={26} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 13.5, color: ink }}>{b.name}</div>
              <div style={{ fontFamily: monoFont, fontSize: 9.5, color: faint }}>
                paid {b.paid} &middot; spent {b.spent}
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontWeight: 800, fontSize: 14, fontVariantNumeric: 'tabular-nums', color: b.netColor }}>{b.net}</div>
              <div style={{ fontSize: 9.5, color: faint, textTransform: 'uppercase', letterSpacing: '.10em', marginTop: 1 }}>{b.status}</div>
            </div>
          </div>
        ))}

        {/* Footer */}
        <div style={{ textAlign: 'center', paddingTop: 18 }}>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 7, marginBottom: 11 }}>
            {[0, 1, 2].map((i) => (
              <span key={i} style={{ width: 5, height: 5, borderRadius: 9, background: '#d2c6ab' }} />
            ))}
          </div>
          <div style={{ fontSize: 12.5, color: '#67736c', fontWeight: 600, lineHeight: 1.55, padding: '0 8px' }}>
            Thanks for a lovely day out. Settle up, then do it all again soon.
          </div>
          <div style={{ fontFamily: monoFont, fontSize: 10, color: faint, marginTop: 11, letterSpacing: '.10em' }}>
            {refNo} &middot; GENERATED BY SPLIT
          </div>
        </div>
      </div>

      {/* Torn zigzag bottom edge */}
      <div
        style={{
          height: 13,
          backgroundColor: 'transparent',
          backgroundImage: `linear-gradient(-45deg, ${paper} 50%, transparent 0), linear-gradient(45deg, ${paper} 50%, transparent 0)`,
          backgroundSize: '16px 16px',
          backgroundPosition: '0 0',
          backgroundRepeat: 'repeat-x',
          filter: 'drop-shadow(0 12px 12px rgba(27,43,39,.10))',
        }}
      />
    </div>
  );
}
