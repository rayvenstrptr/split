import { useState } from 'react';
import type { Person } from '../types';

type Props = {
  people: Person[];
  onAdd: (name: string) => void;
  onRemove: (id: string) => void;
};

export default function PeoplePanel({ people, onAdd, onRemove }: Props) {
  const [name, setName] = useState('');

  const submit = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    onAdd(trimmed);
    setName('');
  };

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-base font-semibold">People</h2>
        <span className="text-xs text-muted">{people.length} in the group</span>
      </div>

      <div className="flex flex-wrap gap-2">
        {people.map((p) => (
          <span
            key={p.id}
            className="group inline-flex items-center gap-1.5 rounded-full bg-accent-soft py-1 pl-3 pr-1.5 text-sm font-medium text-accent"
          >
            {p.name}
            <button
              type="button"
              aria-label={`Remove ${p.name}`}
              onClick={() => onRemove(p.id)}
              className="grid h-5 w-5 place-items-center rounded-full text-accent/70 transition-colors hover:bg-white hover:text-negative"
            >
              ×
            </button>
          </span>
        ))}
        {people.length === 0 && (
          <p className="text-sm text-muted">Add people to get started.</p>
        )}
      </div>

      <div className="mt-4 flex gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          placeholder="Name or initial (e.g. R)"
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-accent"
        />
        <button
          type="button"
          onClick={submit}
          className="shrink-0 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
        >
          Add
        </button>
      </div>
    </section>
  );
}
