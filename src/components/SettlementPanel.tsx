import { useMemo } from 'react';
import type { AppState } from '../types';
import {
  directSettlement,
  minimizeTransfers,
  netBalances,
  perPersonSummary,
} from '../lib/settle';
import { formatIDR } from '../lib/money';
import { personIndex } from '../lib/colors';
import { Avatar, Segmented, SectionHead } from './ui';

type SettlementMode = 'direct' | 'minimize';

type Props = {
  state: AppState;
  settlementMode: SettlementMode;
  onSettlementModeChange: (mode: SettlementMode) => void;
};

export default function SettlementPanel({
  state,
  settlementMode,
  onSettlementModeChange,
}: Props) {
  const { summary, transfers, nameById, balanced } = useMemo(() => {
    const summary = perPersonSummary(state);
    const net = netBalances(state);
    const transfers =
      settlementMode === 'minimize'
        ? minimizeTransfers(net)
        : directSettlement(state);
    const nameById = Object.fromEntries(state.people.map((p) => [p.id, p.name]));
    const balanced = Math.abs(Object.values(net).reduce((s, v) => s + v, 0)) < 1;
    return { summary, transfers, nameById, balanced };
  }, [state, settlementMode]);

  return (
    <section>
      <SectionHead title="Who pays whom" />

      {/* Settlement style toggle */}
      <div className="mb-3">
        <Segmented<SettlementMode>
          value={settlementMode}
          onChange={onSettlementModeChange}
          options={[
            { label: 'Direct', value: 'direct' },
            { label: 'Simplified', value: 'minimize' },
          ]}
        />
        <p className="mx-0.5 mt-1.5 text-xs text-muted">
          {settlementMode === 'direct'
            ? 'Direct — everyone repays whoever actually fronted for them.'
            : 'Simplified — the fewest transfers that still settle everyone.'}
        </p>
      </div>

      {/* On-screen quick summary */}
      <div className="flex flex-col gap-2">
        {transfers.length === 0 && (
          <div className="rounded-card border border-line bg-surface p-5 text-center text-muted">
            Everyone&apos;s settled up.
          </div>
        )}
        {transfers.map((t, i) => (
          <div key={i} className="flex items-center gap-3 rounded-card border border-line bg-surface px-4 py-3.5 shadow-soft">
            <Avatar name={nameById[t.from]} index={personIndex(state.people, t.from)} size={38} />
            <div className="flex flex-1 items-center gap-2 text-sm">
              <strong className="font-bold">{nameById[t.from]}</strong>
              <span className="text-faint">→</span>
              <strong className="font-bold">{nameById[t.to]}</strong>
            </div>
            <Avatar name={nameById[t.to]} index={personIndex(state.people, t.to)} size={38} />
            <div className="tnum min-w-[110px] whitespace-nowrap text-right text-base font-extrabold text-accent">
              {formatIDR(t.amount)}
            </div>
          </div>
        ))}
      </div>

      <SectionHead title="Balances" className="mt-[22px]" />
      <div className="overflow-hidden rounded-card border border-line bg-surface">
        {summary.map((s, i) => (
          <div key={s.id} className={`flex items-center gap-3 px-4 py-3 ${i === 0 ? '' : 'border-t border-line'}`}>
            <Avatar name={nameById[s.id]} index={personIndex(state.people, s.id)} size={32} />
            <span className="flex-1 font-semibold">{nameById[s.id]}</span>
            <div className="text-right">
              <div className="tnum whitespace-nowrap text-[11.5px] text-faint">
                paid {formatIDR(s.paid)} · spent {formatIDR(s.consumed)}
              </div>
              <div
                className={`tnum whitespace-nowrap text-sm font-extrabold ${
                  s.net > 0 ? 'text-positive' : s.net < 0 ? 'text-negative' : 'text-muted'
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
        {balanced ? 'Balances check out — paid and shares net to zero.' : 'Heads up: balances do not net to zero.'}
      </p>
    </section>
  );
}
