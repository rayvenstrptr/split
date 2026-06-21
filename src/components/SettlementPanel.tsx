import { useMemo, useState } from 'react';
import type { AppState } from '../types';
import {
  minimizeTransfers,
  netBalances,
  perPersonSummary,
} from '../lib/settle';
import { formatIDR } from '../lib/money';

type Props = { state: AppState };

export default function SettlementPanel({ state }: Props) {
  const [copied, setCopied] = useState(false);

  const { summary, transfers, nameById, balanced } = useMemo(() => {
    const summary = perPersonSummary(state);
    const net = netBalances(state);
    const transfers = minimizeTransfers(net);
    const nameById = Object.fromEntries(state.people.map((p) => [p.id, p.name]));
    const balanced =
      Math.abs(Object.values(net).reduce((s, v) => s + v, 0)) < 1;
    return { summary, transfers, nameById, balanced };
  }, [state]);

  const copySummary = async () => {
    const lines: string[] = ['*Split Bill — who pays whom*', ''];
    if (transfers.length === 0) {
      lines.push('Everyone is settled up. 🎉');
    } else {
      for (const t of transfers) {
        lines.push(`• ${nameById[t.from]} → ${nameById[t.to]}: ${formatIDR(t.amount)}`);
      }
    }
    lines.push('', '_Balances_');
    for (const s of summary) {
      const tag =
        s.net > 0
          ? `is owed ${formatIDR(s.net)}`
          : s.net < 0
            ? `owes ${formatIDR(-s.net)}`
            : 'settled';
      lines.push(`• ${nameById[s.id]}: ${tag}`);
    }
    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-base font-semibold">Settlement</h2>
        <button
          type="button"
          onClick={copySummary}
          className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-ink transition-colors hover:border-accent hover:text-accent"
        >
          {copied ? 'Copied!' : 'Copy summary'}
        </button>
      </div>

      {/* Who pays whom */}
      {transfers.length === 0 ? (
        <p className="rounded-xl bg-accent-soft px-4 py-3 text-sm font-medium text-accent">
          Everyone is settled up — no payments needed.
        </p>
      ) : (
        <ul className="space-y-2">
          {transfers.map((t, i) => (
            <li
              key={i}
              className="flex items-center justify-between rounded-xl bg-gray-50 px-4 py-3"
            >
              <span className="flex items-center gap-2 text-sm font-medium">
                <Avatar name={nameById[t.from]} />
                <span className="text-muted">pays</span>
                <Avatar name={nameById[t.to]} accent />
              </span>
              <span className="tnum font-semibold text-ink">
                {formatIDR(t.amount)}
              </span>
            </li>
          ))}
        </ul>
      )}

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
                <th className="px-3 py-2 text-right font-medium">Share</th>
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
