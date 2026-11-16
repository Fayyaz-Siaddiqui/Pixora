import { brand } from '@/lib/config';

/**
 * Brand mark: an image frame whose bottom-right corner is a resize handle,
 * with a 2x2 pixel cluster for "precision". Uses currentColor + the accent
 * token so it adapts to both themes.
 */
export function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <path
        d="M4 9a5 5 0 0 1 5-5h14a5 5 0 0 1 5 5v8"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <path d="M4 9v14a5 5 0 0 0 5 5h8" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      <rect x="9.5" y="9.5" width="4" height="4" rx="1" fill="currentColor" />
      <rect x="15" y="9.5" width="4" height="4" rx="1" fill="currentColor" opacity="0.45" />
      <rect x="9.5" y="15" width="4" height="4" rx="1" fill="currentColor" opacity="0.45" />
      <path d="M21 28h7v-7" stroke="var(--accent)" strokeWidth="2.75" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M27.5 27.5 20 20" stroke="var(--accent)" strokeWidth="2.75" strokeLinecap="round" />
    </svg>
  );
}

export function Logo() {
  return (
    <span className="inline-flex items-center gap-2 text-ink">
      <LogoMark />
      <span className="font-display text-lg font-semibold tracking-tight">{brand.name}</span>
    </span>
  );
}
