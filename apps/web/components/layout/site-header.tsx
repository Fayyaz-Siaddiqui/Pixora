import { ChevronDown, Menu } from 'lucide-react';
import Link from 'next/link';
import { Logo } from '@/components/brand/logo';
import { ThemeToggle } from '@/components/theme/theme-toggle';
import { TOOLS } from '@/lib/tools';

function ToolMenuList({ compact = false }: { compact?: boolean }) {
  return (
    <ul className={compact ? 'space-y-1' : 'grid gap-1 sm:grid-cols-2'}>
      {TOOLS.map((t) => (
        <li key={t.href}>
          <Link href={t.href} className="flex items-start gap-3 rounded-ctl p-2.5 hover:bg-surface-2">
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

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-paper/90 backdrop-blur supports-[backdrop-filter]:bg-paper/75">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link href="/" aria-label="Home" className="rounded-ctl">
          <Logo />
        </Link>

        <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
          <details className="group relative">
            <summary className="flex cursor-pointer list-none items-center gap-1 rounded-ctl px-3 py-2 text-sm font-medium hover:bg-surface-2 [&::-webkit-details-marker]:hidden">
              All tools <ChevronDown className="size-4 transition-transform group-open:rotate-180" aria-hidden="true" />
            </summary>
            <div className="absolute left-1/2 mt-2 w-[34rem] -translate-x-1/2 rounded-card border border-line bg-surface p-2 shadow-lg">
              <ToolMenuList />
            </div>
          </details>
          <Link href="/image-resizer" className="rounded-ctl px-3 py-2 text-sm font-medium hover:bg-surface-2">Resize</Link>
          <Link href="/image-compressor" className="rounded-ctl px-3 py-2 text-sm font-medium hover:bg-surface-2">Compress</Link>
          <Link href="/image-converter" className="rounded-ctl px-3 py-2 text-sm font-medium hover:bg-surface-2">Convert</Link>
        </nav>

        <div className="flex items-center gap-2">
          <ThemeToggle />
          <details className="relative md:hidden">
            <summary className="grid size-10 cursor-pointer list-none place-items-center rounded-ctl border border-line [&::-webkit-details-marker]:hidden" aria-label="Menu">
              <Menu className="size-5" aria-hidden="true" />
            </summary>
            <div className="absolute right-0 mt-2 w-64 rounded-card border border-line bg-surface p-2 shadow-lg">
              <ToolMenuList compact />
            </div>
          </details>
        </div>
      </div>
    </header>
  );
}
