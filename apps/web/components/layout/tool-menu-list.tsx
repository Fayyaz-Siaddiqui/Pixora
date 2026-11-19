import Link from 'next/link';
import { TOOLS } from '@/lib/tools';

export function ToolMenuList({ compact = false, onNavigate }: { compact?: boolean; onNavigate?: () => void }) {
  return (
    <ul className={compact ? 'space-y-1' : 'grid gap-1 sm:grid-cols-2'}>
      {TOOLS.map((t) => (
        <li key={t.href}>
          <Link href={t.href} onClick={onNavigate} className="flex items-start gap-3 rounded-ctl p-2.5 hover:bg-surface-2">
            <t.Icon className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden="true" />
            <span>
              <span className="block text-sm font-medium">{t.name}</span>
              {!compact && <span className="block text-xs text-ink-muted">{t.summary}</span>}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
