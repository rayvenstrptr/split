import { useMemo, useRef, useState } from 'react';
import type { AppState, WheelName } from '../types';
import { useLocalStorage, readStored } from '../hooks/useLocalStorage';
import { sampleState } from '../data/sample';
import { Button, SectionHead, ConfirmDialog } from './ui';
import SpinWheel from './SpinWheel';
import { WORKING_STATE_KEY } from './SplitBillApp';

const WHEEL_KEY = 'split-bill-id/wheel-text/v1';
const MAX_NAMES = 100;

/** One line = one name. Blank lines are ignored; the first 100 names win. */
function parseNames(text: string): WheelName[] {
  const names: WheelName[] = [];
  const lines = text.split('\n');
  for (let i = 0; i < lines.length && names.length < MAX_NAMES; i++) {
    const label = lines[i].trim();
    if (label) names.push({ id: `w_${i}`, label });
  }
  return names;
}

export default function SpinWheelApp({
  onOpenMenu,
}: {
  onOpenMenu: () => void;
}) {
  // The textarea text is the source of truth; the wheel's names are derived from it.
  const [text, setText] = useLocalStorage<string>(WHEEL_KEY, '');
  // Random initial orientation so the wheel never rests with the first name on top.
  const [rotation, setRotation] = useState(() => Math.random() * 360);
  const [spinning, setSpinning] = useState(false);
  const [winnerId, setWinnerId] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const winnerRef = useRef<string | null>(null);

  const names = useMemo(() => parseNames(text), [text]);
  const overflow = text.split('\n').filter((l) => l.trim()).length - names.length;
  const canSpin = names.length >= 2 && !spinning;
  const winner = names.find((w) => w.id === winnerId) ?? null;

  /* ---- Name list edits (operate on the raw text) ---- */
  const removeName = (id: string) => {
    const idx = Number(id.slice(2)); // line index encoded in the id (`w_<i>`)
    setText((cur) => cur.split('\n').filter((_, i) => i !== idx).join('\n'));
    if (winnerId === id) setWinnerId(null);
  };

  const shuffle = () => {
    if (spinning) return;
    const a = text.split('\n').filter((l) => l.trim());
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    setText(a.join('\n'));
    setWinnerId(null);
  };

  const clearAll = () => {
    setText('');
    setWinnerId(null);
    setConfirmClear(false);
  };

  const importPeople = () => {
    const people = readStored<AppState>(WORKING_STATE_KEY, sampleState).people;
    if (people.length === 0) {
      alert('No people in the current Split Bill session to import.');
      return;
    }
    setText((cur) => {
      const seen = new Set(
        cur.split('\n').map((l) => l.trim().toLowerCase()).filter(Boolean),
      );
      const additions: string[] = [];
      for (const p of people) {
        const label = p.name.trim();
        if (!label || seen.has(label.toLowerCase())) continue;
        seen.add(label.toLowerCase());
        additions.push(label);
      }
      if (additions.length === 0) return cur;
      const base = cur.replace(/\n+$/, '');
      return (base ? base + '\n' : '') + additions.join('\n');
    });
  };

  /* ---- Spin ---- */
  const spin = () => {
    const n = names.length;
    if (n < 2 || spinning) return;
    const winIdx = Math.floor(Math.random() * n);
    winnerRef.current = names[winIdx].id;
    const slice = 360 / n;
    const center = (winIdx + 0.5) * slice;
    const jitter = (Math.random() - 0.5) * slice * 0.6; // stay inside the slice
    const target = ((360 - ((center + jitter) % 360)) % 360 + 360) % 360;
    let delta = target - (rotation % 360);
    if (delta <= 0) delta += 360;
    setWinnerId(null);
    setSpinning(true);
    setRotation((r) => r + 5 * 360 + delta);
  };

  const onSpinEnd = () => {
    setSpinning(false);
    setWinnerId(winnerRef.current);
  };

  return (
    <div className="mx-auto min-h-full max-w-[600px] px-4 pb-[72px] pt-7">
      <header className="mb-5 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={onOpenMenu}
            aria-label="Open menu"
            title="Switch app"
            className="grid h-[34px] w-[34px] place-items-center rounded-[11px] border border-line-strong bg-surface text-ink transition-colors hover:border-accent hover:text-accent"
          >
            <span className="text-[15px] leading-none">☰</span>
          </button>
          <span
            className="grid h-[34px] w-[34px] place-items-center rounded-[11px] bg-terracotta text-[18px] font-extrabold text-white"
            style={{ transform: 'rotate(-6deg)' }}
            aria-hidden
          >
            🎡
          </span>
          <div className="text-[19px] font-extrabold tracking-tight">
            Spin<span className="text-terracotta">.</span>
          </div>
        </div>
        <span className="shrink-0 text-[12.5px] font-semibold text-muted">
          {names.length}/{MAX_NAMES} names
        </span>
      </header>

      <div className="space-y-6">
        <section>
          <SpinWheel
            names={names}
            rotation={rotation}
            spinning={spinning}
            onSpin={spin}
            onSpinEnd={onSpinEnd}
          />

          {/* Result */}
          {winner && (
            <div className="mt-4 rounded-card border border-line bg-surface p-4 text-center shadow-soft">
              <div className="text-[11px] font-bold uppercase tracking-wide text-faint">
                Winner
              </div>
              <div className="my-1.5 break-words text-2xl font-extrabold tracking-tight text-ink">
                {winner.label}
              </div>
              <div className="mt-3 flex justify-center gap-2">
                <Button variant="secondary" size="sm" onClick={spin} disabled={!canSpin}>
                  ↻ Respin
                </Button>
                <Button
                  size="sm"
                  onClick={() => removeName(winner.id)}
                  className="bg-negative text-white hover:bg-negative"
                >
                  Remove
                </Button>
              </div>
            </div>
          )}
        </section>

        <section>
          <SectionHead
            title="Names"
            right={
              <Button
                variant="ghost"
                size="sm"
                onClick={importPeople}
                disabled={names.length >= MAX_NAMES}
                title="Import from the current Split Bill session"
              >
                ↧ Import people
              </Button>
            }
          />
          <div className="rounded-card border border-line bg-surface p-3.5 shadow-soft">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              spellCheck={false}
              rows={8}
              placeholder={'One name per line, e.g.\nRani\nGema\nHadi\nKira'}
              className="block w-full resize-y rounded-field border-[1.5px] border-line-strong bg-surface px-3 py-2.5 text-sm leading-relaxed text-ink outline-none focus:border-accent"
            />
            <p className="mt-2 px-0.5 text-xs text-muted">
              One name per line. Up to {MAX_NAMES} names — longer names are shortened on the wheel.
              {overflow > 0 && (
                <span className="font-semibold text-negative">
                  {' '}Only the first {MAX_NAMES} are used ({overflow} extra ignored).
                </span>
              )}
            </p>

            {/* Controls */}
            <div className="mt-3 flex flex-wrap gap-2">
              <Button onClick={spin} disabled={!canSpin}>
                🎯 Spin
              </Button>
              <Button variant="secondary" onClick={shuffle} disabled={names.length < 2 || spinning}>
                🔀 Shuffle
              </Button>
              <Button
                variant="secondary"
                onClick={() => setConfirmClear(true)}
                disabled={text.trim().length === 0}
                className="ml-auto"
              >
                Clear
              </Button>
            </div>
          </div>
        </section>
      </div>

      <ConfirmDialog
        open={confirmClear}
        title="Clear all names?"
        message={`This removes all ${names.length} name${names.length === 1 ? '' : 's'} from the wheel. This can't be undone.`}
        confirmLabel="Clear all"
        cancelLabel="Cancel"
        destructive
        onConfirm={clearAll}
        onCancel={() => setConfirmClear(false)}
      />
    </div>
  );
}
