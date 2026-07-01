import { useState, type ReactNode } from 'react';
import type { Bill, BillEntry, Person } from '../types';
import { billShares } from '../lib/settle';
import { formatIDR } from '../lib/money';
import { personIndex } from '../lib/colors';
import { Avatar, Button, Segmented } from './ui';
import MoneyInput from './MoneyInput';
import BillItemsEditor from './BillItemsEditor';

type Props = {
  bill: Bill;
  people: Person[];
  onChange: (bill: Bill) => void;
  onRemove: () => void;
  orderControls?: ReactNode;
};

/** Whether the user has entered anything worth confirming before a delete. */
function billHasData(bill: Bill): boolean {
  return (
    bill.entries.some((e) => e.amount > 0) ||
    (bill.items?.some(
      (it) => it.price > 0 || it.name.trim() !== '' || it.ownerIds.length > 0,
    ) ??
      false) ||
    (bill.total ?? 0) > 0
  );
}

export default function BillCard({
  bill,
  people,
  onChange,
  onRemove,
  orderControls,
}: Props) {
  const [open, setOpen] = useState(true);
  const [showDiscount, setShowDiscount] = useState((bill.discount ?? 0) > 0);
  const result = billShares(bill);
  const isItem = bill.splitMode === 'byItem';
  const payer = people.find((p) => p.id === bill.payerId);

  // The bill footer collapses to a single "Total" line when there's nothing to
  // itemise — no tax/service and no discount (item #5).
  const hasSurcharge =
    bill.mode === 'fromPercent'
      ? (bill.servicePercent ?? 0) > 0 || (bill.taxPercent ?? 0) > 0
      : result.surcharge > 0;
  const hasDiscount = result.discount > 0;

  const requestRemove = () => {
    if (
      billHasData(bill) &&
      !confirm(`Delete “${bill.name || 'this stop'}”? Its amounts will be lost.`)
    )
      return;
    onRemove();
  };

  const isOrdering = (id: string) => bill.entries.some((e) => e.personId === id);
  const amountOf = (id: string) =>
    bill.entries.find((e) => e.personId === id)?.amount ?? 0;

  const patch = (p: Partial<Bill>) => onChange({ ...bill, ...p });

  const setSplitMode = (splitMode: 'byPerson' | 'byItem') => {
    if (splitMode === 'byItem') {
      patch({ splitMode, items: bill.items ?? [] });
    } else {
      patch({
        splitMode,
        entries: bill.entries.length
          ? bill.entries
          : people.map((p): BillEntry => ({ personId: p.id, amount: 0 })),
      });
    }
  };

  const toggleOrder = (id: string) => {
    if (isOrdering(id)) {
      patch({ entries: bill.entries.filter((e) => e.personId !== id) });
    } else {
      patch({ entries: [...bill.entries, { personId: id, amount: 0 }] });
    }
  };

  const setAmount = (id: string, amount: number) => {
    patch({
      entries: bill.entries.map((e) =>
        e.personId === id ? { ...e, amount } : e,
      ),
    });
  };

  const splitEqually = () => {
    const n = bill.entries.length;
    if (n === 0) return;
    const base =
      bill.mode === 'fromTotal' && (bill.total ?? 0) > 0
        ? result.total // already net of the discount (settle subtracts it)
        : result.subtotal;
    if (base <= 0) return;
    const each = Math.round(base / n);
    patch({
      entries: bill.entries.map((e): BillEntry => ({ ...e, amount: each })),
    });
  };

  return (
    <div className="overflow-hidden rounded-card border border-line bg-surface shadow-soft">
      {/* Header */}
      <div className="flex items-center gap-2.5 px-4 py-3.5">
        {orderControls}
        <Avatar
          name={payer?.name ?? '?'}
          index={personIndex(people, bill.payerId)}
          size={40}
        />
        <div className="min-w-0 flex-1">
          <input
            value={bill.name}
            onChange={(e) => patch({ name: e.target.value })}
            placeholder="Bill name"
            className="w-full border-0 bg-transparent p-0 text-base font-bold text-ink outline-none"
          />
          <div className="mt-px flex items-center gap-1 text-[12.5px] text-muted">
            paid by
            <select
              value={bill.payerId}
              onChange={(e) => patch({ payerId: e.target.value })}
              className="cursor-pointer border-0 bg-transparent p-0 text-[12.5px] font-bold text-accent outline-none"
            >
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="tnum whitespace-nowrap text-base font-extrabold">
            {formatIDR(result.total)}
          </div>
          <div className="whitespace-nowrap text-[11.5px] text-faint">
            {isItem
              ? `${(bill.items ?? []).length} items`
              : `${bill.entries.length} ordering`}
          </div>
        </div>
        <button
          type="button"
          onClick={() => setOpen(!open)}
          aria-label={open ? 'Collapse' : 'Expand'}
          aria-expanded={open}
          className="p-1.5 text-faint transition-transform"
          style={{ transform: open ? 'rotate(180deg)' : 'none' }}
        >
          ▾
        </button>
      </div>

      {open && (
        <div className="border-t border-line px-4 pb-4 pt-1">
          <div className="my-3.5">
            <Segmented<'byPerson' | 'byItem'>
              value={isItem ? 'byItem' : 'byPerson'}
              onChange={setSplitMode}
              options={[
                { label: 'Per person', value: 'byPerson' },
                { label: 'By item', value: 'byItem' },
              ]}
            />
          </div>

          {isItem ? (
            <BillItemsEditor
              bill={bill}
              people={people}
              result={result}
              onChange={onChange}
            />
          ) : (
            <>
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-faint">
                  Who ordered
                </span>
                <Button variant="ghost" size="sm" onClick={splitEqually}>
                  Split equally
                </Button>
              </div>

              <div className="flex flex-col gap-1.5">
                {people.map((p) => {
                  const ordering = isOrdering(p.id);
                  return (
                    <div
                      key={p.id}
                      onClick={(e) => {
                        if ((e.target as HTMLElement).tagName !== 'INPUT')
                          toggleOrder(p.id);
                      }}
                      className={`flex cursor-pointer items-center gap-2.5 rounded-field px-2 py-1.5 transition-colors ${
                        ordering ? 'bg-surface-2 opacity-100' : 'opacity-55'
                      }`}
                    >
                      <span
                        className={`grid h-[18px] w-[18px] shrink-0 place-items-center rounded-md border-[1.5px] text-[11px] leading-none text-white ${
                          ordering
                            ? 'border-accent bg-accent'
                            : 'border-line-strong bg-surface'
                        }`}
                      >
                        {ordering ? '✓' : ''}
                      </span>
                      <Avatar
                        name={p.name}
                        index={personIndex(people, p.id)}
                        size={26}
                      />
                      <span className="flex-1 text-sm font-semibold">
                        {p.name}
                      </span>
                      <div
                        className="w-[130px]"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <MoneyInput
                          value={amountOf(p.id)}
                          onChange={(v) => setAmount(p.id, v)}
                          disabled={!ordering}
                          ariaLabel={`${p.name} order amount`}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {/* Surcharge controls */}
          <div className="mt-3.5 rounded-well bg-surface-2 p-3">
            <Segmented<'fromTotal' | 'fromPercent'>
              value={bill.mode}
              onChange={(mode) =>
                patch(
                  mode === 'fromPercent'
                    ? {
                        mode,
                        servicePercent: bill.servicePercent ?? 5,
                        taxPercent: bill.taxPercent ?? 10,
                      }
                    : { mode },
                )
              }
              options={[
                { label: 'Know the total', value: 'fromTotal' },
                { label: 'Tax & service %', value: 'fromPercent' },
              ]}
            />
            <div className="mt-3">
              {bill.mode === 'fromTotal' ? (
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm text-muted">Total actually paid</span>
                  <div className="w-[150px]">
                    <MoneyInput
                      value={bill.total ?? 0}
                      onChange={(v) => patch({ total: v })}
                      ariaLabel="Total paid"
                    />
                  </div>
                </div>
              ) : (
                <div className="flex gap-2.5">
                  <PercentInput
                    label="Service %"
                    value={bill.servicePercent ?? 0}
                    onChange={(v) => patch({ servicePercent: v })}
                  />
                  <PercentInput
                    label="Tax %"
                    value={bill.taxPercent ?? 0}
                    onChange={(v) => patch({ taxPercent: v })}
                  />
                </div>
              )}
            </div>

            {/* Optional discount (item #4) — applied before service & tax */}
            {showDiscount || hasDiscount ? (
              <div className="mt-3 flex items-center justify-between gap-3">
                <span className="text-sm text-muted">Discount</span>
                <div className="flex items-center gap-1.5">
                  <div className="w-[150px]">
                    <MoneyInput
                      value={bill.discount ?? 0}
                      onChange={(v) => patch({ discount: v })}
                      ariaLabel="Discount amount"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      patch({ discount: undefined });
                      setShowDiscount(false);
                    }}
                    aria-label="Remove discount"
                    title="Remove discount"
                    className="grid h-[30px] w-[30px] shrink-0 place-items-center rounded-field text-sm text-faint transition-colors hover:bg-negative-soft hover:text-negative"
                  >
                    ✕
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowDiscount(true)}
                className="mt-3 text-[12.5px] font-semibold text-accent transition-colors hover:text-accent-strong"
              >
                ＋ Add discount
              </button>
            )}
          </div>

          {/* Breakdown */}
          <dl className="mt-2.5 flex flex-col gap-0.5 text-[13px]">
            {!hasSurcharge && !hasDiscount ? (
              <Row label="Total" value={formatIDR(result.total)} muted />
            ) : (
              <>
                <Row label="Subtotal" value={formatIDR(result.subtotal)} muted />
                {hasDiscount && (
                  <Row label="Discount" value={`− ${formatIDR(result.discount)}`} muted />
                )}
                {bill.mode === 'fromPercent' ? (
                  <>
                    {result.service > 0 && (
                      <Row label="Service" value={formatIDR(result.service)} muted />
                    )}
                    {result.tax > 0 && (
                      <Row label="Tax" value={formatIDR(result.tax)} muted />
                    )}
                  </>
                ) : (
                  result.surcharge > 0 && (
                    <Row
                      label="Tax + service"
                      value={`${formatIDR(result.surcharge)} · ${result.effectiveSurchargePct.toFixed(1)}%`}
                      muted
                    />
                  )
                )}
                <div className="mt-1 border-t border-line pt-1">
                  <Row label="Total" value={formatIDR(result.total)} strong />
                </div>
              </>
            )}
          </dl>

          <div className="mt-3 flex justify-end">
            <button
              type="button"
              onClick={requestRemove}
              className="inline-flex cursor-pointer items-center justify-center rounded-full px-3 py-[7px] text-[12.5px] font-semibold text-negative transition-colors hover:bg-negative-soft"
            >
              Remove stop
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function PercentInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="flex-1">
      <span className="text-[12.5px] text-muted">{label}</span>
      <div className="mt-1 flex items-center rounded-field border-[1.5px] border-line-strong bg-surface px-2.5 focus-within:border-accent">
        <input
          type="number"
          min={0}
          step={0.5}
          value={Number.isFinite(value) ? value : 0}
          onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
          className="tnum w-full bg-transparent py-2 text-right text-sm font-semibold outline-none"
        />
        <span className="select-none pl-1 text-faint">%</span>
      </div>
    </label>
  );
}

function Row({
  label,
  value,
  muted,
  strong,
}: {
  label: string;
  value: string;
  muted?: boolean;
  strong?: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <dt className={muted ? 'text-muted' : ''}>{label}</dt>
      <dd
        className={`tnum whitespace-nowrap ${strong ? 'font-extrabold' : 'font-semibold'} ${
          muted ? 'text-muted' : ''
        }`}
      >
        {value}
      </dd>
    </div>
  );
}
