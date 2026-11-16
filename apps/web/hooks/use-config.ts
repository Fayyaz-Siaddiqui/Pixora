'use client';

import { useEffect, useState } from 'react';
import { api, errorMessage } from '@/lib/api';
import type { PublicConfig } from '@/lib/types';

let cache: PublicConfig | null = null;
let inflight: Promise<PublicConfig> | null = null;

/** Server limits and capabilities (upload size, formats, presets). Fetched once per page load. */
export function useConfig(): { config: PublicConfig | null; error: string | null } {
  const [config, setConfig] = useState<PublicConfig | null>(cache);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (cache) return;
    inflight ??= api.config();
    inflight
      .then((c) => {
        cache = c;
        setConfig(c);
      })
      .catch((err: unknown) => {
        inflight = null;
        setError(errorMessage(err));
      });
  }, []);

  return { config, error };
}
