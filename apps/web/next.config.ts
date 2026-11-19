import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { NextConfig } from 'next';

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));

// Share the single root `.env` with the API. Only NEXT_PUBLIC_* values reach the browser.
const rootEnv = path.join(repoRoot, '.env');
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

// Optional proxy mode (e.g. website on Vercel, API on another machine):
// the browser calls `/api/*` on the website's own domain and Next.js forwards
// it to API_PROXY_TARGET. Same-origin requests keep the visitor cookie
// first-party, so no shared parent domain is needed.
const apiProxyTarget = process.env.API_PROXY_TARGET?.trim().replace(/\/+$/, '');
if (apiProxyTarget) {
  if (!/^https?:\/\//.test(apiProxyTarget)) throw new Error('API_PROXY_TARGET must start with http:// or https://');
  process.env.NEXT_PUBLIC_API_URL = '';
} else if (process.env.VERCEL === '1' && !process.env.NEXT_PUBLIC_API_URL?.trim()) {
  // Without this the site would silently call http://localhost:4000 (the visitor's
  // own machine): uploads look like they work on the developer's PC but break for everyone.
  throw new Error(
    'API_PROXY_TARGET is not set. In Vercel: Settings → Environment Variables → add API_PROXY_TARGET ' +
      '= your API URL (e.g. https://pixora-api.vercel.app) for the Production environment, then redeploy.',
  );
}

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  // Internal workspace packages ship TypeScript source.
  transpilePackages: ['@app/shared', '@app/image-core'],
  turbopack: { root: repoRoot },
  outputFileTracingRoot: repoRoot,
  async rewrites() {
    return apiProxyTarget ? [{ source: '/api/:path*', destination: `${apiProxyTarget}/api/:path*` }] : [];
  },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default nextConfig;
