import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { NextConfig } from 'next';

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));

// Share the single root `.env` with the API. Only NEXT_PUBLIC_* values reach the browser.
const rootEnv = path.join(repoRoot, '.env');
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

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
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default nextConfig;
