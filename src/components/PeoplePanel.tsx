import { useState } from 'react';
import type { Person } from '../types';
import type { PersonSummary } from '../lib/settle';
import { formatIDR } from '../lib/money';
import { personIndex } from '../lib/colors';
import { Avatar, Button, SectionHead } from './ui';

type Props = {
  people: Person[];
  summary: PersonSummary[];
  onAdd: (name: string) => void;
  onRemove: (id: string) => void;
};

export default function PeoplePanel({ people, summary, onAdd, onRemove }: Props) {
  const [name, setName] = useState('');
  const netById = Object.fromEntries(summary.map((s) => [s.id, s.net]));

  const submit = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    onAdd(trimmed);
    setName('');
  };

  return (
    <section>
      <SectionHead title="People" right={`${people.length} in the group`} />
      <div className="rounded-card border border-line bg-surface p-3.5 shadow-soft">
        <div className="flex flex-wrap gap-2">
          {people.length === 0 && (
            <p className="py-1 text-sm text-muted">Add people to get started.</p>
          )}
          {people.map((p) => {
            const net = netById[p.id] ?? 0;
            return (
              <div
                key={p.id}
                className="flex items-center gap-2 rounded-full border border-line bg-surface-2 py-[5px] pl-2 pr-1.5"
              >
                <Avatar name={p.name} index={personIndex(people, p.id)} size={26} />
                <div className="leading-[1.1]">
                  <div className="text-[13px] font-bold">{p.name}</div>
                  <div
                    className={`tnum whitespace-nowrap text-[11px] font-bold ${
                      net > 0
                        ? 'text-positive'
                        : net < 0
                          ? 'text-negative'
                          : 'text-faint'
                    }`}
                  >
                    {net > 0 ? '+' : ''}
                    {formatIDR(net)}
                  </div>
                </div>
                <button
                  type="button"
                  aria-label={`Remove ${p.name}`}
                  onClick={() => onRemove(p.id)}
                  className="grid h-5 w-5 place-items-center rounded-full text-faint transition-colors hover:bg-negative-soft hover:text-negative"
                >
                  ×
                </button>
              </div>
            );
          })}
        </div>

        <div className="mt-3 flex gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
            placeholder="Add someone…"
            className="flex-1 rounded-field border-[1.5px] border-line-strong bg-surface px-3 py-2.5 text-sm text-ink outline-none focus:border-accent"
          />
          <Button onClick={submit} className="shrink-0">
            Add
          </Button>
        </div>
      </div>
    </section>
  );
}
