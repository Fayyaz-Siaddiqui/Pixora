import { cx } from '@/lib/format';

/** Plain style helpers (no 'use client'), usable from both server and client components. */
export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

export const buttonStyles: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-accent-ink hover:brightness-110 disabled:brightness-100',
  secondary: 'border border-line bg-surface text-ink hover:bg-surface-2',
  ghost: 'text-ink-muted hover:bg-surface-2 hover:text-ink',
  danger: 'border border-line bg-surface text-bad hover:bg-bad-soft',
};

export const linkButtonClass = (variant: ButtonVariant = 'secondary', size: 'md' | 'lg' = 'md') =>
  cx(
    'inline-flex items-center justify-center gap-2 rounded-ctl font-medium transition-[background-color,filter,color]',
    size === 'md' ? 'h-10 px-4 text-sm' : 'h-12 px-6 text-base',
    buttonStyles[variant],
  );
