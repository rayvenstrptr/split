import type { WheelName } from '../types';
import { wheelColorFor } from '../lib/colors';

type Props = {
  names: WheelName[];
  rotation: number; // absolute degrees
  spinning: boolean;
  onSpin: () => void;
  onSpinEnd: () => void;
};

const R = 48; // wheel radius within the 0..100 viewBox
const RIM = R - 3; // labels anchor just inside the rim and grow toward the center
const HUB_R = 14; // keep labels clear of the center spin button
const CHAR_W = 0.58; // approx glyph advance per font unit (bold sans)
const SPIN_MS = 4500;
const WHEEL_MAX_LEN = 20; // only the first 20 chars of a name show on the wheel

/** Trim a name to the first 20 chars for the wheel, adding an ellipsis if cut. */
function wheelLabel(label: string) {
  return label.length > WHEEL_MAX_LEN ? label.slice(0, WHEEL_MAX_LEN) + '...' : label;
}

/** Point on the rim at a clock-angle (degrees, clockwise from 12 o'clock). */
function rimPoint(clockDeg: number, r = R) {
  const rad = (clockDeg * Math.PI) / 180;
  return { x: 50 + r * Math.sin(rad), y: 50 - r * Math.cos(rad) };
}

function slicePath(i: number, n: number) {
  const a0 = (i / n) * 360;
  const a1 = ((i + 1) / n) * 360;
  const p0 = rimPoint(a0);
  const p1 = rimPoint(a1);
  const large = a1 - a0 > 180 ? 1 : 0;
  return `M50 50 L ${p0.x.toFixed(3)} ${p0.y.toFixed(3)} A ${R} ${R} 0 ${large} 1 ${p1.x.toFixed(3)} ${p1.y.toFixed(3)} Z`;
}

/**
 * The spinning wheel: pure SVG slices rotated by a CSS transition, with a fixed
 * pointer at 12 o'clock and a SPIN button at the hub. The parent owns the
 * rotation/spinning state and the landing math; this component is presentational.
 */
export default function SpinWheel({
  names,
  rotation,
  spinning,
  onSpin,
  onSpinEnd,
}: Props) {
  const n = names.length;
  const slice = n > 0 ? 360 / n : 360;
  const showLabels = n > 0; // labels always show; the font shrinks to fit the slice
  const canSpin = n >= 2 && !spinning;

  return (
    <div className="relative mx-auto aspect-square w-full max-w-[520px]">
      {/* Pointer at top (does not rotate) */}
      <div
        aria-hidden
        className="absolute left-1/2 top-[-2px] z-20 -translate-x-1/2 drop-shadow"
        style={{
          width: 0,
          height: 0,
          borderLeft: '11px solid transparent',
          borderRight: '11px solid transparent',
          borderTop: '18px solid var(--color-terracotta)',
        }}
      />

      {/* Rotating wheel */}
      <div
        className="h-full w-full"
        style={{
          transform: `rotate(${rotation}deg)`,
          transformOrigin: 'center',
          transition: spinning
            ? `transform ${SPIN_MS}ms cubic-bezier(0.17, 0.67, 0.18, 0.99)`
            : 'none',
        }}
        onTransitionEnd={(e) => {
          if (e.propertyName === 'transform' && spinning) onSpinEnd();
        }}
      >
        <svg viewBox="0 0 100 100" className="h-full w-full">
          <circle cx="50" cy="50" r={R} fill="var(--color-surface-2)" />
          {n === 1 ? (
            <circle cx="50" cy="50" r={R} fill={wheelColorFor(0)} />
          ) : (
            names.map((nm, i) => (
              <path
                key={nm.id}
                d={slicePath(i, n)}
                fill={wheelColorFor(i)}
                stroke="#ffffff"
                strokeWidth={0.6}
              />
            ))
          )}

          {showLabels &&
            names.map((nm, i) => {
              // Anchor each label just inside the rim and run it radially toward the
              // center, flipping upright on the lower half. The text grows inward as
              // it lengthens, so longer names reach further toward the hub.
              const mid = (i + 0.5) * slice;
              const rad = (mid * Math.PI) / 180;
              const px = 50 + RIM * Math.sin(rad);
              const py = 50 - RIM * Math.cos(rad);
              const flip = mid > 90 && mid < 270;
              const angle = flip ? mid + 90 : mid - 90;
              const label = wheelLabel(nm.label);
              // Fit the type to the wedge: bound it by the radial room between rim and
              // hub, and by the tangential room between neighbouring slices, so every
              // name stays inside its own slice however many there are.
              const chars = Math.max(label.length, 3);
              const k = ((2 * Math.PI) / n) * 0.82;
              const fontSize = Math.min(
                4.2,
                (k * RIM) / (1 + CHAR_W * k * chars),
                (RIM - HUB_R) / (CHAR_W * chars),
              );
              return (
                <text
                  key={nm.id}
                  x={px}
                  y={py}
                  transform={`rotate(${angle} ${px} ${py})`}
                  textAnchor={flip ? 'start' : 'end'}
                  dominantBaseline="middle"
                  fontSize={fontSize}
                  fontWeight={700}
                  fill="#44403b"
                  style={{ pointerEvents: 'none', userSelect: 'none' }}
                >
                  {label}
                </text>
              );
            })}
        </svg>
      </div>

      {/* Center SPIN button (does not rotate) */}
      <button
        type="button"
        onClick={onSpin}
        disabled={!canSpin}
        aria-label="Spin the wheel"
        className="absolute left-1/2 top-1/2 z-10 grid h-[22%] w-[22%] -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-4 border-surface bg-accent text-[13px] font-extrabold uppercase tracking-wide text-white shadow-card transition-colors hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-60"
      >
        Spin
      </button>
    </div>
  );
}
