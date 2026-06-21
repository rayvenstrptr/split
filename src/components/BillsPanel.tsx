import type { Bill, Person } from '../types';
import BillCard from './BillCard';

type Props = {
  bills: Bill[];
  people: Person[];
  onAdd: () => void;
  onUpdate: (bill: Bill) => void;
  onRemove: (id: string) => void;
};

export default function BillsPanel({
  bills,
  people,
  onAdd,
  onUpdate,
  onRemove,
}: Props) {
  return (
    <section>
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-base font-semibold">Bills</h2>
        <span className="text-xs text-muted">{bills.length} stops</span>
      </div>

      <div className="space-y-3">
        {bills.map((bill) => (
          <BillCard
            key={bill.id}
            bill={bill}
            people={people}
            onChange={onUpdate}
            onRemove={() => onRemove(bill.id)}
          />
        ))}
      </div>

      <button
        type="button"
        onClick={onAdd}
        disabled={people.length === 0}
        className="mt-3 w-full rounded-2xl border-2 border-dashed border-gray-300 py-3 text-sm font-medium text-muted transition-colors hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-50"
      >
        + Add a bill
      </button>
    </section>
  );
}
