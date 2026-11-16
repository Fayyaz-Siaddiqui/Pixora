import type { Metadata } from 'next';
import { toolByHref } from './tools';

/** Title, description, canonical URL and Open Graph for a tool page. */
export function toolMetadata(href: string): Metadata {
  const t = toolByHref(href);
  return {
    title: t.seoTitle,
    description: t.seoDescription,
    alternates: { canonical: href },
    openGraph: { title: t.seoTitle, description: t.seoDescription, url: href },
  };
}
