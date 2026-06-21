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
      className={`flex items-center rounded-lg border bg-white px-2.5 transition-colors focus-within:border-accent ${
        disabled ? 'border-gray-200 bg-gray-50 opacity-60' : 'border-gray-300'
      } ${className}`}
    >
      <span className="select-none pr-1 text-sm text-muted">Rp</span>
      <input
        inputMode="numeric"
        aria-label={ariaLabel}
        disabled={disabled}
        placeholder={placeholder}
        value={value > 0 ? groupDigits(value) : ''}
        onChange={(e) => onChange(parseIDR(e.target.value))}
        className="tnum w-full bg-transparent py-1.5 text-right text-sm outline-none disabled:cursor-not-allowed"
      />
    </div>
  );
}
