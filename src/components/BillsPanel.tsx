import type { Bill, Person } from '../types';
import BillCard from './BillCard';
import ReorderableList from './ReorderableList';
import { SectionHead } from './ui';

type Props = {
  bills: Bill[];
  people: Person[];
  onAdd: () => void;
  onUpdate: (bill: Bill) => void;
  onRemove: (id: string) => void;
  onReorder: (from: number, to: number) => void;
};

export default function BillsPanel({
  bills,
  people,
  onAdd,
  onUpdate,
  onRemove,
  onReorder,
}: Props) {
  return (
    <section>
      <SectionHead title="Bills" right={`${bills.length} stops`} />

      <div className="space-y-3">
        <ReorderableList
          items={bills}
          getKey={(b) => b.id}
          onReorder={onReorder}
          itemClassName="rounded-card"
          renderItem={(bill, _i, handle) => (
            <BillCard
              bill={bill}
              people={people}
              onChange={onUpdate}
              onRemove={() => onRemove(bill.id)}
              orderControls={handle}
            />
          )}
        />
      </div>

      <button
        type="button"
        onClick={onAdd}
        disabled={people.length === 0}
        className="mt-3 w-full rounded-card border-[1.5px] border-dashed border-line-strong py-3.5 text-sm font-bold text-muted transition-colors hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-50"
      >
        + Add a stop
      </button>
    </section>
  );
}
