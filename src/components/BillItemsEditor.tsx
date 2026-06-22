import type { Bill, BillItem, Person } from '../types';
import type { BillResult } from '../lib/settle';
import { uid } from '../lib/id';
import { formatIDR } from '../lib/money';
import { moveItem } from '../lib/reorder';
import MoneyInput from './MoneyInput';
import ReorderableList from './ReorderableList';

type Props = {
  bill: Bill;
  people: Person[];
  result: BillResult;
  onChange: (bill: Bill) => void;
};

/**
 * Item-based bill editor: line items (name + price) each assigned to one or more
 * owners; the price splits equally among them. Renders a per-person "spent this
 * bill" summary derived from the same `billShares` result as the rest of the card.
 */
export default function BillItemsEditor({ bill, people, result, onChange }: Props) {
  const items = bill.items ?? [];

  const updateItems = (next: BillItem[]) => onChange({ ...bill, items: next });

  const addItem = () =>
    updateItems([
      ...items,
      { id: uid('it_'), name: '', price: 0, ownerIds: people.map((p) => p.id) },
    ]);

  const removeItem = (id: string) => updateItems(items.filter((it) => it.id !== id));

  const patchItem = (id: string, p: Partial<BillItem>) =>
    updateItems(items.map((it) => (it.id === id ? { ...it, ...p } : it)));

  const toggleOwner = (id: string, pid: string) => {
    const it = items.find((i) => i.id === id);
    if (!it) return;
    patchItem(id, {
      ownerIds: it.ownerIds.includes(pid)
        ? it.ownerIds.filter((o) => o !== pid)
        : [...it.ownerIds, pid],
    });
  };

  const unassigned = items.filter((it) => it.ownerIds.length === 0 && it.price > 0).length;

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-faint">
          Items
        </span>
        <span className="text-xs text-faint">{items.length}</span>
      </div>

      <div className="flex flex-col gap-2">
        {items.length === 0 && (
          <p className="py-1.5 text-[13px] text-muted">
            No items yet. Add what was ordered and tap who shared each one.
          </p>
        )}
        <ReorderableList
          items={items}
          getKey={(it) => it.id}
          onReorder={(from, to) => updateItems(moveItem(items, from, to))}
          itemClassName="rounded-well border border-line bg-surface p-2.5"
          renderItem={(it, _i, handle) => {
            const perOwner =
              it.ownerIds.length > 0 ? Math.round(it.price / it.ownerIds.length) : 0;
            return (
              <>
                <div className="flex items-center gap-2">
                  {handle}
                  <input
                    value={it.name}
                    onChange={(e) => patchItem(it.id, { name: e.target.value })}
                    placeholder="Item name"
                    className="min-w-0 flex-1 border-0 bg-transparent p-0 text-sm font-semibold text-ink outline-none"
                  />
                  <div className="w-[120px] shrink-0">
                    <MoneyInput
                      value={it.price}
                      onChange={(v) => patchItem(it.id, { price: v })}
                      ariaLabel={`${it.name || 'Item'} price`}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => removeItem(it.id)}
                    aria-label="Remove item"
                    className="grid h-7 w-7 shrink-0 place-items-center rounded-field text-faint transition-colors hover:bg-negative-soft hover:text-negative"
                  >
                    ✕
                  </button>
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  {people.map((p) => {
                    const owns = it.ownerIds.includes(p.id);
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => toggleOwner(it.id, p.id)}
                        aria-pressed={owns}
                        className={`rounded-full px-2.5 py-[5px] text-xs font-bold transition-colors ${
                          owns
                            ? 'bg-accent text-white'
                            : 'bg-accent-soft text-accent hover:opacity-80'
                        }`}
                      >
                        {p.name}
                      </button>
                    );
                  })}
                  <span className="tnum ml-auto whitespace-nowrap pl-2 text-xs text-muted">
                    {it.ownerIds.length > 0
                      ? `${formatIDR(perOwner)} each`
                      : it.price > 0
                        ? 'unassigned'
                        : '—'}
                  </span>
                </div>
              </>
            );
          }}
        />
      </div>

      <button
        type="button"
        onClick={addItem}
        className="mt-2 w-full rounded-well border-[1.5px] border-dashed border-line-strong py-2.5 text-[13px] font-bold text-muted transition-colors hover:border-accent hover:text-accent"
      >
        + Add item
      </button>

      {unassigned > 0 && (
        <p className="mt-2 text-xs text-negative">
          {unassigned} item{unassigned > 1 ? 's' : ''} with a price but no owner — assign
          someone, or they won&apos;t be split.
        </p>
      )}

      {/* Per-person "spent this bill" */}
      <div className="mt-3">
        <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-faint">
          Spent this bill
        </span>
        <div className="mt-1">
          {people.map((p, i) => {
            const amt = result.perPerson[p.id] ?? 0;
            return (
              <div
                key={p.id}
                className={`flex items-center justify-between py-1.5 text-[13px] ${
                  i === 0 ? '' : 'border-t border-line'
                }`}
              >
                <span className={amt > 0 ? 'font-semibold' : 'text-muted'}>
                  {p.name}
                </span>
                <span className="tnum whitespace-nowrap text-muted">
                  {amt > 0 ? formatIDR(amt) : '—'}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
