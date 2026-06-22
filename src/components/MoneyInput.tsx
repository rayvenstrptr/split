import { groupDigits, parseIDR } from '../lib/money';

type Props = {
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  ariaLabel?: string;
};

/** Rupiah input: shows grouped digits (150.000), stores integer rupiah. */
export default function MoneyInput({
  value,
  onChange,
  disabled,
  placeholder = '0',
  className = '',
  ariaLabel,
}: Props) {
  return (
    <div
      className={`flex items-center gap-0.5 rounded-field border-[1.5px] px-2.5 transition-colors focus-within:border-accent ${
        disabled
          ? 'border-line bg-surface-2 opacity-55'
          : 'border-line-strong bg-surface'
      } ${className}`}
    >
      <span className="select-none text-[13px] font-semibold text-faint">Rp</span>
      <input
        inputMode="numeric"
        aria-label={ariaLabel}
        disabled={disabled}
        placeholder={placeholder}
        value={value > 0 ? groupDigits(value) : ''}
        onChange={(e) => onChange(parseIDR(e.target.value))}
        className="tnum w-full bg-transparent py-2 text-right text-sm font-semibold text-ink outline-none disabled:cursor-not-allowed"
      />
    </div>
  );
}
