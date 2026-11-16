import type { ReactNode } from 'react';
import { brand, siteUrl } from '@/lib/config';
import type { ToolInfo } from '@/lib/tools';

/** Server-rendered frame for a tool: heading, the interactive tool, then an explanation for users and search engines. */
export function ToolPage({ tool, intro, children, about }: { tool: ToolInfo; intro: string; children: ReactNode; about: { q: string; a: string }[] }) {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebApplication',
        name: `${brand.name} ${tool.name}`,
        url: `${siteUrl}${tool.href}`,
        applicationCategory: 'MultimediaApplication',
        operatingSystem: 'Any (web browser)',
        description: tool.seoDescription,
        offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
      },
      {
        '@type': 'FAQPage',
        mainEntity: about.map((x) => ({ '@type': 'Question', name: x.q, acceptedAnswer: { '@type': 'Answer', text: x.a } })),
      },
    ],
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
      <header className="mb-6 max-w-2xl">
        <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">{tool.name}</h1>
        <p className="mt-2 text-pretty text-ink-muted">{intro}</p>
      </header>

      {children}

      <section aria-labelledby="about-heading" className="mt-16 max-w-3xl">
        <h2 id="about-heading" className="font-display text-xl font-semibold">
          About the {tool.name.toLowerCase()}
        </h2>
        <dl className="mt-4 space-y-5">
          {about.map((x) => (
            <div key={x.q}>
              <dt className="font-medium">{x.q}</dt>
              <dd className="mt-1 text-sm text-pretty text-ink-muted">{x.a}</dd>
            </div>
          ))}
        </dl>
      </section>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }} />
    </div>
  );
}
