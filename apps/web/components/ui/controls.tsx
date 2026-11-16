'use client';

import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react';
import { useId, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cx } from '@/lib/format';
import { buttonStyles, type ButtonVariant } from './button-styles';

// ───────── Button ─────────

export function Button({
  variant = 'secondary',
  size = 'md',
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: 'sm' | 'md' | 'lg' }) {
  return (
    <button
      type="button"
      {...props}
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-ctl font-medium transition-[background-color,filter,color] disabled:cursor-not-allowed disabled:opacity-50',
        size === 'sm' && 'h-8 px-3 text-sm',
        size === 'md' && 'h-10 px-4 text-sm',
        size === 'lg' && 'h-12 px-6 text-base',
        buttonStyles[variant],
        className,
      )}
    />
  );
}

// ───────── Field wrapper ─────────

export function Field({ label, hint, children, htmlFor }: { label: string; hint?: ReactNode; children: ReactNode; htmlFor?: string }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-sm font-medium">
        {label}
      </label>
      {children}
      {hint && <p className="text-xs text-ink-muted">{hint}</p>}
    </div>
  );
}

const inputClass =
  'h-10 w-full rounded-ctl border border-line bg-surface px-3 text-sm text-ink placeholder:text-ink-muted/70 focus:border-focus focus:outline-none';

export function NumberField({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  suffix,
  hint,
  placeholder,
  disabled,
}: {
  label: string;
  value: number | '';
  onChange: (v: number | '') => void;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
  hint?: ReactNode;
  placeholder?: string;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <Field label={label} hint={hint} htmlFor={id}>
      <div className="relative">
        <input
          id={id}
          type="number"
          inputMode="numeric"
          className={cx(inputClass, suffix && 'pr-10')}
          value={value}
          min={min}
          max={max}
          step={step}
          placeholder={placeholder}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))}
        />
        {suffix && <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-ink-muted">{suffix}</span>}
      </div>
    </Field>
  );
}

export function SelectField<T extends string>({
  label,
  value,
  onChange,
  options,
  hint,
}: {
  label: string;
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  hint?: ReactNode;
}) {
  const id = useId();
  return (
    <Field label={label} hint={hint} htmlFor={id}>
      <select id={id} className={inputClass} value={value} onChange={(e) => onChange(e.target.value as T)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </Field>
  );
}

export function ColorField({ label, value, onChange, hint }: { label: string; value: string; onChange: (v: string) => void; hint?: ReactNode }) {
  const id = useId();
  return (
    <Field label={label} hint={hint} htmlFor={id}>
      <div className="flex items-center gap-2">
        <input
          id={id}
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-10 w-12 cursor-pointer rounded-ctl border border-line bg-surface p-1"
        />
        <input
          aria-label={`${label} hex value`}
          className={cx(inputClass, 'font-mono uppercase')}
          value={value}
          maxLength={7}
          onChange={(e) => {
            const v = e.target.value.startsWith('#') ? e.target.value : `#${e.target.value}`;
            if (/^#[0-9a-fA-F]{0,6}$/.test(v)) onChange(v);
          }}
        />
      </div>
    </Field>
  );
}

// ───────── Slider ─────────

export function Slider({
  label,
  value,
  onChange,
  onCommit,
  min,
  max,
  step = 1,
  format = (v) => String(v),
  neutral,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  /** Called when the user releases the slider (used for undo history). */
  onCommit?: () => void;
  min: number;
  max: number;
  step?: number;
  format?: (v: number) => string;
  /** Double-click resets to this value. */
  neutral?: number;
}) {
  const id = useId();
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between">
        <label htmlFor={id} className="text-sm font-medium">
          {label}
        </label>
        <span className="font-mono text-xs tabular-nums text-ink-muted">{format(value)}</span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        onPointerUp={onCommit}
        onKeyUp={onCommit}
        onDoubleClick={() => {
          if (neutral !== undefined) {
            onChange(neutral);
            onCommit?.();
          }
        }}
        className="w-full accent-[var(--accent)]"
      />
    </div>
  );
}

// ───────── Segmented control ─────────

export function Segmented<T extends string>({
  label,
  value,
  onChange,
  options,
  hideLabel,
}: {
  label: string;
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string; title?: string }[];
  hideLabel?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <span className={cx('block text-sm font-medium', hideLabel && 'sr-only')}>{label}</span>
      <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1 rounded-ctl border border-line bg-surface-2 p-1">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={value === o.value}
            title={o.title}
            onClick={() => onChange(o.value)}
            className={cx(
              'min-w-0 flex-1 rounded-[0.375rem] px-2.5 py-1.5 text-sm font-medium transition-colors',
              value === o.value ? 'bg-surface text-ink shadow-sm' : 'text-ink-muted hover:text-ink',
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// ───────── Switch ─────────

export function Switch({ label, checked, onChange, hint }: { label: string; checked: boolean; onChange: (v: boolean) => void; hint?: ReactNode }) {
  const id = useId();
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <label htmlFor={id} className="text-sm font-medium">
          {label}
        </label>
        {hint && <p className="text-xs text-ink-muted">{hint}</p>}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cx('relative mt-0.5 h-6 w-10 shrink-0 rounded-full transition-colors', checked ? 'bg-accent' : 'bg-line')}
      >
        <span className={cx('absolute top-0.5 left-0 size-5 rounded-full bg-white shadow transition-transform', checked ? 'translate-x-[1.125rem]' : 'translate-x-0.5')} />
      </button>
    </div>
  );
}

// ───────── Notice ─────────

const noticeStyles = {
  info: { box: 'bg-surface-2 text-ink', Icon: Info, icon: 'text-ink-muted' },
  warn: { box: 'bg-accent-soft text-ink', Icon: AlertTriangle, icon: 'text-accent' },
  error: { box: 'bg-bad-soft text-ink', Icon: XCircle, icon: 'text-bad' },
  success: { box: 'bg-ok-soft text-ink', Icon: CheckCircle2, icon: 'text-ok' },
} as const;

export function Notice({ tone = 'info', children, action }: { tone?: keyof typeof noticeStyles; children: ReactNode; action?: ReactNode }) {
  const s = noticeStyles[tone];
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={cx('flex items-start gap-3 rounded-ctl px-3.5 py-3 text-sm', s.box)}>
      <s.Icon className={cx('mt-0.5 size-4 shrink-0', s.icon)} aria-hidden="true" />
      <div className="min-w-0 flex-1">{children}</div>
      {action}
    </div>
  );
}

export function ProgressBar({ value, label }: { value: number; label: string }) {
  return (
    <div role="progressbar" aria-label={label} aria-valuenow={Math.round(value)} aria-valuemin={0} aria-valuemax={100} className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
      <div className="h-full rounded-full bg-accent transition-[width] duration-300" style={{ width: `${Math.max(2, Math.min(100, value))}%` }} />
    </div>
  );
}
