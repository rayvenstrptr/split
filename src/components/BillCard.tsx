import type { Bill, BillEntry, Person } from '../types';
import { billShares } from '../lib/settle';
import { formatIDR } from '../lib/money';
import MoneyInput from './MoneyInput';

type Props = {
  bill: Bill;
  people: Person[];
  onChange: (bill: Bill) => void;
  onRemove: () => void;
};

export default function BillCard({ bill, people, onChange, onRemove }: Props) {
  const result = billShares(bill);

  const isOrdering = (id: string) => bill.entries.some((e) => e.personId === id);
  const amountOf = (id: string) =>
    bill.entries.find((e) => e.personId === id)?.amount ?? 0;

  const patch = (p: Partial<Bill>) => onChange({ ...bill, ...p });

  const toggleOrder = (id: string) => {
    if (isOrdering(id)) {
      patch({ entries: bill.entries.filter((e) => e.personId !== id) });
    } else {
      patch({ entries: [...bill.entries, { personId: id, amount: 0 }] });
    }
  };

  const setAmount = (id: string, amount: number) => {
    const entries = bill.entries.map((e) =>
      e.personId === id ? { ...e, amount } : e,
    );
    patch({ entries });
  };

  const splitEqually = () => {
    const n = bill.entries.length;
    if (n === 0) return;
    const base =
      bill.mode === 'fromTotal' && (bill.total ?? 0) > 0
        ? (bill.total as number)
        : result.subtotal;
    if (base <= 0) return;
    const each = Math.round(base / n);
    patch({ entries: bill.entries.map((e): BillEntry => ({ ...e, amount: each })) });
  };

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
      {/* Header: name + payer + remove */}
      <div className="flex items-center gap-2">
        <input
          value={bill.name}
          onChange={(e) => patch({ name: e.target.value })}
          placeholder="Bill name"
          className="min-w-0 flex-1 rounded-lg border border-transparent px-1 py-1 text-base font-semibold outline-none hover:border-gray-200 focus:border-accent"
        />
        <button
          type="button"
          onClick={onRemove}
          aria-label="Remove bill"
          className="grid h-8 w-8 place-items-center rounded-lg text-muted transition-colors hover:bg-rose-50 hover:text-negative"
        >
          ✕
        </button>
      </div>

      <label className="mt-2 flex items-center gap-2 text-sm">
        <span className="text-muted">Paid by</span>
        <select
          value={bill.payerId}
          onChange={(e) => patch({ payerId: e.target.value })}
          className="rounded-lg border border-gray-300 bg-white px-2 py-1 text-sm font-medium outline-none focus:border-accent"
        >
          {people.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>

      {/* Participants */}
      <div className="mt-3 flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-muted">
          Who ordered
        </span>
        <button
          type="button"
          onClick={splitEqually}
          className="text-xs font-medium text-accent hover:underline"
        >
          Split equally
        </button>
      </div>

      <div className="mt-2 divide-y divide-gray-100">
        {people.map((p) => {
          const ordering = isOrdering(p.id);
          return (
            <div key={p.id} className="flex items-center gap-3 py-2">
              <label className="flex w-28 shrink-0 items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={ordering}
                  onChange={() => toggleOrder(p.id)}
                  className="h-4 w-4 accent-[color:var(--color-accent)]"
                />
                <span className={ordering ? 'font-medium' : 'text-muted'}>
                  {p.name}
                </span>
              </label>
              <div className="flex-1">
                <MoneyInput
                  value={amountOf(p.id)}
                  onChange={(v) => setAmount(p.id, v)}
                  disabled={!ordering}
                  ariaLabel={`${p.name} order amount`}
                />
              </div>
              <span className="tnum w-28 shrink-0 text-right text-sm text-muted">
                {ordering ? formatIDR(result.perPerson[p.id] ?? 0) : '—'}
              </span>
            </div>
          );
        })}
      </div>

      {/* Surcharge controls */}
      <div className="mt-4 rounded-xl bg-gray-50 p-3">
        <div className="mb-3 inline-flex rounded-lg border border-gray-300 bg-white p-0.5 text-xs font-medium">
          <button
            type="button"
            onClick={() => patch({ mode: 'fromTotal' })}
            className={`rounded-md px-3 py-1.5 transition-colors ${
              bill.mode === 'fromTotal' ? 'bg-accent text-white' : 'text-muted'
            }`}
          >
            Know the total
          </button>
          <button
            type="button"
            onClick={() =>
              patch({
                mode: 'fromPercent',
                servicePercent: bill.servicePercent ?? 5,
                taxPercent: bill.taxPercent ?? 10,
              })
            }
            className={`rounded-md px-3 py-1.5 transition-colors ${
              bill.mode === 'fromPercent' ? 'bg-accent text-white' : 'text-muted'
            }`}
          >
            Enter tax &amp; service %
          </button>
        </div>

        {bill.mode === 'fromTotal' ? (
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm text-muted">Total actually paid</span>
            <div className="w-40">
              <MoneyInput
                value={bill.total ?? 0}
                onChange={(v) => patch({ total: v })}
                ariaLabel="Total paid"
              />
            </div>
          </div>
        ) : (
          <div className="flex gap-3">
            <label className="flex-1 text-sm">
              <span className="text-muted">Service %</span>
              <PercentInput
                value={bill.servicePercent ?? 0}
                onChange={(v) => patch({ servicePercent: v })}
              />
            </label>
            <label className="flex-1 text-sm">
              <span className="text-muted">Tax %</span>
              <PercentInput
                value={bill.taxPercent ?? 0}
                onChange={(v) => patch({ taxPercent: v })}
              />
            </label>
          </div>
        )}
      </div>

      {/* Breakdown */}
      <dl className="mt-3 space-y-1 text-sm">
        <Row label="Subtotal" value={formatIDR(result.subtotal)} />
        {bill.mode === 'fromPercent' ? (
          <>
            <Row label="Service" value={formatIDR(result.service)} muted />
            <Row label="Tax" value={formatIDR(result.tax)} muted />
          </>
        ) : (
          <Row
            label="Tax + service"
            value={`${formatIDR(result.surcharge)} · ${result.effectiveSurchargePct.toFixed(1)}%`}
            muted
          />
        )}
        <Row label="Total" value={formatIDR(result.total)} strong />
      </dl>
    </div>
  );
}

function PercentInput({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="mt-1 flex items-center rounded-lg border border-gray-300 bg-white px-2.5 focus-within:border-accent">
      <input
        type="number"
        min={0}
        step={0.5}
        value={Number.isFinite(value) ? value : 0}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        className="tnum w-full bg-transparent py-1.5 text-right text-sm outline-none"
      />
      <span className="select-none pl-1 text-sm text-muted">%</span>
    </div>
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
        className={`tnum ${strong ? 'font-semibold' : ''} ${
          muted ? 'text-muted' : ''
        }`}
      >
        {value}
      </dd>
    </div>
  );
}
