import type { MetadataRoute } from 'next';
import { brand } from '@/lib/config';

/** Web app manifest: name and icons used by "Add to Home Screen" on phones. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: brand.name,
    short_name: brand.name,
    description: brand.tagline,
    start_url: '/',
    display: 'standalone',
    background_color: '#16181d',
    theme_color: '#16181d',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
