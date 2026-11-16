import type { MetadataRoute } from 'next';
import { siteUrl } from '@/lib/config';
import { TOOLS } from '@/lib/tools';

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return [
    { url: `${siteUrl}/`, lastModified: now, changeFrequency: 'weekly', priority: 1 },
    ...TOOLS.map((t) => ({ url: `${siteUrl}${t.href}`, lastModified: now, changeFrequency: 'monthly' as const, priority: 0.8 })),
    { url: `${siteUrl}/privacy`, lastModified: now, changeFrequency: 'yearly', priority: 0.3 },
  ];
}
