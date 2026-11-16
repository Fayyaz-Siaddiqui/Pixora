import Link from 'next/link';
import { linkButtonClass } from '@/components/ui/button-styles';

export default function NotFound() {
  return (
    <div className="mx-auto max-w-xl px-4 py-24 text-center">
      <p className="font-display text-6xl font-semibold text-accent">404</p>
      <h1 className="mt-4 font-display text-2xl font-semibold">This page doesn’t exist</h1>
      <p className="mt-2 text-ink-muted">The link may be old or mistyped.</p>
      <Link href="/" className={`${linkButtonClass('primary')} mt-8`}>
        Go to the homepage
      </Link>
    </div>
  );
}
