import Link from 'next/link';
import { Logo } from '@/components/brand/logo';
import { brand } from '@/lib/config';
import { TOOLS } from '@/lib/tools';

export function SiteFooter() {
  return (
    <footer className="mt-24 border-t border-line">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-[1.2fr_2fr]">
        <div className="space-y-3">
          <Logo />
          <p className="max-w-xs text-sm text-ink-muted">{brand.tagline}</p>
        </div>
        <div className="grid gap-8 sm:grid-cols-2">
          <nav aria-label="Tools">
            <h2 className="mb-3 text-sm font-semibold">Tools</h2>
            <ul className="space-y-2 text-sm">
              {TOOLS.map((t) => (
                <li key={t.href}>
                  <Link href={t.href} className="text-ink-muted hover:text-ink">
                    {t.name}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          <nav aria-label="Company">
            <h2 className="mb-3 text-sm font-semibold">{brand.name}</h2>
            <ul className="space-y-2 text-sm">
              <li><Link href="/privacy" className="text-ink-muted hover:text-ink">Privacy & image handling</Link></li>
              <li><Link href="/status" className="text-ink-muted hover:text-ink">System status</Link></li>
            </ul>
          </nav>
        </div>
      </div>
      <div className="border-t border-line">
        <p className="mx-auto max-w-6xl px-4 py-5 text-xs text-ink-muted sm:px-6">
          © {new Date().getFullYear()} {brand.name}. Uploaded images are private and deleted automatically.
        </p>
      </div>
    </footer>
  );
}
