import { resolveBrand } from '@app/shared';

// NEXT_PUBLIC_* variables are inlined at build time, so they must be read
// with literal property access (not a dynamic lookup).
export const brand = resolveBrand({
  NEXT_PUBLIC_BRAND_NAME: process.env.NEXT_PUBLIC_BRAND_NAME,
  NEXT_PUBLIC_BRAND_TAGLINE: process.env.NEXT_PUBLIC_BRAND_TAGLINE,
});

export const apiUrl = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000').replace(/\/+$/, '');

export const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000').replace(/\/+$/, '');
