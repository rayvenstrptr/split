import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { colorFor } from '../lib/colors';

/* ---------- Avatar — round initials, colored by person index ---------- */
export function Avatar({
  name = '',
  index = 0,
  size = 36,
}: {
  name?: string;
  index?: number;
  size?: number;
}) {
  const c = colorFor(index);
  return (
    <span
      className="grid shrink-0 select-none place-items-center rounded-full font-bold text-white"
      style={{
        height: size,
        width: size,
        background: c.bg,
        fontSize: size * 0.36,
        letterSpacing: '-0.01em',
      }}
    >
      {name.slice(0, 2)}
    </span>
  );
}

/* ---------- Button — primary / secondary / ghost, two sizes ---------- */
type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost';
  size?: 'sm' | 'md';
};

const VARIANTS: Record<NonNullable<ButtonProps['variant']>, string> = {
  primary: 'bg-accent text-white hover:bg-accent-strong',
  secondary:
    'bg-surface text-ink border border-line-strong hover:border-accent hover:text-accent',
  ghost: 'bg-transparent text-accent hover:bg-accent-soft',
};

const SIZES: Record<NonNullable<ButtonProps['size']>, string> = {
  sm: 'px-3 py-[7px] text-[12.5px]',
  md: 'px-4 py-2.5 text-sm',
};

export function Button({
  variant = 'primary',
  size = 'md',
  className = '',
  type = 'button',
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={`inline-flex cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-full font-semibold leading-none transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${SIZES[size]} ${VARIANTS[variant]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

/* ---------- SegmentedToggle — pill segmented control ---------- */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { label: string; value: T }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="flex gap-[3px] rounded-full border border-line bg-surface p-[3px]">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            className={`flex-1 cursor-pointer rounded-full px-2.5 py-[7px] text-[12.5px] font-bold transition-colors ${
              on ? 'bg-accent text-white' : 'text-muted hover:text-ink'
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/* ---------- SectionHead — title + optional right slot ---------- */
export function SectionHead({
  title,
  right,
  className = '',
}: {
  title: string;
  right?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`mx-0.5 mb-3 flex items-baseline justify-between gap-2 ${className}`}
    >
      <h2 className="text-base font-extrabold tracking-tight">{title}</h2>
      {right != null &&
        (typeof right === 'string' || typeof right === 'number' ? (
          <span className="text-[12.5px] font-semibold text-muted">{right}</span>
        ) : (
          right
        ))}
    </div>
  );
}
