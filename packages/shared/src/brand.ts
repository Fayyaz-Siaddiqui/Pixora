/**
 * Brand identity. The product name is never hardcoded elsewhere: every
 * component and email template reads it from here, and here it comes from
 * environment variables (later also from admin Platform Settings).
 */
export interface BrandConfig {
  name: string;
  tagline: string;
}

export const DEFAULT_BRAND: BrandConfig = {
  name: 'Pixora',
  tagline: 'Resize, enhance and perfect your images without compromising quality.',
};

export function resolveBrand(env: Record<string, string | undefined>): BrandConfig {
  return {
    name: env.NEXT_PUBLIC_BRAND_NAME?.trim() || DEFAULT_BRAND.name,
    tagline: env.NEXT_PUBLIC_BRAND_TAGLINE?.trim() || DEFAULT_BRAND.tagline,
  };
}
