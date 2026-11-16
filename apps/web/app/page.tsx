import { ArrowRight, Check, Lock, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { linkButtonClass } from '@/components/ui/button-styles';
import { HomeUpload } from '@/features/home/home-upload';
import { brand, siteUrl } from '@/lib/config';
import { TOOLS } from '@/lib/tools';

const FAQ = [
  { q: `Is ${brand.name} free?`, a: 'Yes. All tools on this site are free to use, up to 200 images per day.' },
  { q: 'What happens to my images?', a: 'They are processed on our servers, visible only to you, never used for AI training, and deleted automatically after 24 hours. You can delete them yourself at any time.' },
  { q: 'Will resizing reduce quality?', a: 'Making images smaller keeps them sharp: we use the Lanczos3 filter, start from your original every time and encode only once. Making images larger than the original always softens them, because standard resizing cannot add detail. We tell you when that happens.' },
  { q: 'Which formats are supported?', a: 'You can upload JPG, PNG, WebP, AVIF, GIF and TIFF, and save as JPG, PNG, WebP or AVIF.' },
  { q: 'Can I process many images at once?', a: 'Yes. Upload up to 20 at a time, apply the same settings to all of them and download everything as one ZIP.' },
  { q: 'Do you offer AI upscaling?', a: 'Not yet. When it launches it will use a real super-resolution model, clearly separated from standard resizing.' },
];

const DIFFERENCES = [
  { title: 'Resizing', text: 'Changes the pixel dimensions. Shrinking stays sharp; enlarging spreads existing pixels and looks softer.' },
  { title: 'AI super-resolution', text: 'A trained model predicts plausible new detail when enlarging. It is a different process from resizing (coming later).' },
  { title: 'Sharpening', text: 'Increases contrast along edges so details look crisper. It cannot recover detail that was never captured.' },
  { title: 'Compression', text: 'Reduces the file size by storing the same image more efficiently. Lower quality settings mean smaller files.' },
];

const FORMATS = [
  { f: 'JPG', alpha: false, best: 'Photos, maximum compatibility' },
  { f: 'PNG', alpha: true, best: 'Graphics, screenshots, lossless' },
  { f: 'WebP', alpha: true, best: 'Websites: smaller than JPG and PNG' },
  { f: 'AVIF', alpha: true, best: 'Smallest files in modern browsers' },
];

const QUALITY = [
  'Every result is rendered from your original upload',
  'Lanczos3 resampling by default',
  'Camera orientation applied automatically',
  'Colour profiles converted correctly to sRGB',
  'Transparency kept where the format allows it',
  'Encoded once, with no repeated quality loss',
];

export default function HomePage() {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'WebSite', name: brand.name, url: siteUrl },
      { '@type': 'FAQPage', mainEntity: FAQ.map((x) => ({ '@type': 'Question', name: x.q, acceptedAnswer: { '@type': 'Answer', text: x.a } })) },
    ],
  };

  return (
    <>
      {/* Hero */}
      <section className="mx-auto grid max-w-6xl items-center gap-10 px-4 pt-12 pb-16 sm:px-6 lg:grid-cols-[1.05fr_1fr] lg:pt-20">
        <div>
          <h1 className="font-display text-4xl leading-[1.05] font-semibold tracking-tight text-balance sm:text-5xl lg:text-[3.5rem]">
            Resize, enhance & perfect your images <span className="text-accent">without compromising quality.</span>
          </h1>
          <p className="mt-5 max-w-xl text-lg text-pretty text-ink-muted">
            Exact dimensions, smaller files and the right format, processed from your original with professional-grade resampling. No account needed.
          </p>
          <ul className="mt-6 grid gap-2 text-sm sm:grid-cols-2">
            {['Exact pixel sizes & presets', 'JPG, PNG, WebP, AVIF', 'Batch processing + ZIP', 'Private, auto-deleted in 24 h'].map((t) => (
              <li key={t} className="flex items-center gap-2">
                <Check className="size-4 text-ok" aria-hidden="true" /> {t}
              </li>
            ))}
          </ul>
        </div>
        <HomeUpload />
      </section>

      {/* Tools */}
      <section aria-labelledby="tools-heading" className="border-y border-line bg-surface">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <h2 id="tools-heading" className="font-display text-3xl font-semibold tracking-tight">Every tool you need</h2>
          <p className="mt-2 text-ink-muted">Upload once and use your images in any tool.</p>
          <ul className="mt-8 grid gap-px overflow-hidden rounded-card border border-line bg-line sm:grid-cols-2 lg:grid-cols-3">
            {TOOLS.map((t) => (
              <li key={t.href} className="bg-surface">
                <Link href={t.href} className="group flex h-full flex-col gap-3 p-6 transition-colors hover:bg-surface-2">
                  <t.Icon className="size-6 text-accent" aria-hidden="true" />
                  <span className="font-display text-lg font-semibold">{t.name}</span>
                  <span className="text-sm text-ink-muted">{t.summary}</span>
                  <span className="mt-auto inline-flex items-center gap-1 text-sm font-medium text-accent">
                    Open <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* How it works */}
      <section aria-labelledby="how-heading" className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <h2 id="how-heading" className="font-display text-3xl font-semibold tracking-tight">How it works</h2>
        <ol className="mt-8 grid gap-8 md:grid-cols-3">
          {[
            ['Upload', 'Drop, browse or paste images. We check each file’s real content and size limits.'],
            ['Adjust', 'Choose the size, quality or format. You see the exact output size before processing.'],
            ['Compare & download', 'Drag the slider to compare with the original, then download one file or a ZIP.'],
          ].map(([title, text], i) => (
            <li key={title} className="space-y-2">
              <span className="font-display text-4xl font-semibold text-accent">{String(i + 1).padStart(2, '0')}</span>
              <h3 className="text-lg font-semibold">{title}</h3>
              <p className="text-sm text-ink-muted">{text}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* Quality + honesty */}
      <section aria-labelledby="quality-heading" className="border-y border-line bg-surface">
        <div className="mx-auto grid max-w-6xl gap-12 px-4 py-20 sm:px-6 lg:grid-cols-2">
          <div>
            <h2 id="quality-heading" className="font-display text-3xl font-semibold tracking-tight">Built for quality, honest about limits</h2>
            <ul className="mt-6 space-y-3">
              {QUALITY.map((q) => (
                <li key={q} className="flex gap-3 text-sm">
                  <Check className="mt-0.5 size-4 shrink-0 text-ok" aria-hidden="true" /> {q}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="flex items-center gap-2 text-lg font-semibold">
              <Sparkles className="size-5 text-accent" aria-hidden="true" /> What’s the difference?
            </h3>
            <dl className="mt-4 grid gap-4 sm:grid-cols-2">
              {DIFFERENCES.map((d) => (
                <div key={d.title} className="rounded-card border border-line p-4">
                  <dt className="font-medium">{d.title}</dt>
                  <dd className="mt-1 text-sm text-ink-muted">{d.text}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </section>

      {/* Formats */}
      <section aria-labelledby="formats-heading" className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <h2 id="formats-heading" className="font-display text-3xl font-semibold tracking-tight">Supported formats</h2>
        <p className="mt-2 text-ink-muted">Upload JPG, PNG, WebP, AVIF, GIF or TIFF. Save as any of these:</p>
        <div className="mt-6 overflow-x-auto">
          <table className="w-full min-w-[32rem] text-left text-sm">
            <thead>
              <tr className="border-b border-line text-ink-muted">
                <th scope="col" className="py-3 pr-4 font-medium">Format</th>
                <th scope="col" className="py-3 pr-4 font-medium">Transparency</th>
                <th scope="col" className="py-3 font-medium">Best for</th>
              </tr>
            </thead>
            <tbody>
              {FORMATS.map((r) => (
                <tr key={r.f} className="border-b border-line">
                  <th scope="row" className="py-3 pr-4 font-semibold">{r.f}</th>
                  <td className="py-3 pr-4">{r.alpha ? 'Yes' : 'No'}</td>
                  <td className="py-3 text-ink-muted">{r.best}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* FAQ */}
      <section aria-labelledby="faq-heading" className="mx-auto max-w-3xl px-4 pb-20 sm:px-6">
        <h2 id="faq-heading" className="font-display text-3xl font-semibold tracking-tight">Questions</h2>
        <div className="mt-6 divide-y divide-line border-y border-line">
          {FAQ.map((x) => (
            <details key={x.q} className="group py-4">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium [&::-webkit-details-marker]:hidden">
                {x.q}
                <span className="text-xl text-ink-muted transition-transform group-open:rotate-45" aria-hidden="true">+</span>
              </summary>
              <p className="mt-2 text-sm text-pretty text-ink-muted">{x.a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="flex flex-col items-start justify-between gap-6 rounded-card bg-ink px-6 py-10 text-paper sm:flex-row sm:items-center sm:px-10">
          <div>
            <h2 className="font-display text-2xl font-semibold">Ready when you are.</h2>
            <p className="mt-1 inline-flex items-center gap-1.5 text-sm opacity-80">
              <Lock className="size-3.5" aria-hidden="true" /> No sign-up. Your files stay private.
            </p>
          </div>
          <Link href="/image-resizer" className={linkButtonClass('primary', 'lg')}>
            Start resizing <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </div>
      </section>

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }} />
    </>
  );
}
