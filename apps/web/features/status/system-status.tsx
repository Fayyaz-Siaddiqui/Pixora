'use client';

import { CheckCircle2, Loader2, RefreshCw, XCircle } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { healthResponseSchema, type HealthResponse } from '@app/shared';
import { apiUrl } from '@/lib/config';

type State =
  | { kind: 'loading' }
  | { kind: 'unreachable' }
  | { kind: 'invalid' }
  | { kind: 'ready'; health: HealthResponse; checkedAt: Date };

const REFRESH_MS = 15_000;

export function SystemStatus() {
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (signal?: AbortSignal) => {
    setRefreshing(true);
    try {
      const res = await fetch(`${apiUrl}/api/health`, { cache: 'no-store', signal });
      // 503 still carries a valid health body describing what is down.
      const parsed = healthResponseSchema.safeParse(await res.json());
      setState(parsed.success ? { kind: 'ready', health: parsed.data, checkedAt: new Date() } : { kind: 'invalid' });
    } catch (err) {
      if ((err as Error).name !== 'AbortError') setState({ kind: 'unreachable' });
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    const ctrl = new AbortController();
    void load(ctrl.signal);
    const id = setInterval(() => void load(ctrl.signal), REFRESH_MS);
    return () => {
      ctrl.abort();
      clearInterval(id);
    };
  }, [load]);

  return (
    <section aria-labelledby="status-heading" className="rounded-card border border-line bg-surface">
      <div className="flex items-center justify-between gap-4 border-b border-line px-5 py-4">
        <div>
          <h2 id="status-heading" className="font-display text-base font-semibold">
            System status
          </h2>
          <p className="text-sm text-ink-muted">
            Live check of the API, database and image engine
            {state.kind === 'ready' && <> · checked {state.checkedAt.toLocaleTimeString()}</>}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={refreshing}
          className="inline-flex items-center gap-2 rounded-ctl border border-line px-3 py-1.5 text-sm hover:bg-surface-2 disabled:opacity-60"
        >
          <RefreshCw className={`size-4 ${refreshing ? 'animate-spin' : ''}`} aria-hidden="true" />
          Refresh
        </button>
      </div>

      <div className="px-5 py-4" aria-live="polite">
        {state.kind === 'loading' && (
          <p className="flex items-center gap-2 text-sm text-ink-muted">
            <Loader2 className="size-4 animate-spin" aria-hidden="true" /> Checking services…
          </p>
        )}

        {state.kind === 'unreachable' && (
          <div className="rounded-ctl bg-bad-soft px-4 py-3 text-sm">
            <p className="font-medium text-bad">The API is not reachable at {apiUrl}.</p>
            <p className="mt-1 text-ink-muted">
              Start it with <code className="font-mono">npm run dev:api</code> and check that{' '}
              <code className="font-mono">NEXT_PUBLIC_API_URL</code> in <code className="font-mono">.env</code> is correct.
            </p>
          </div>
        )}

        {state.kind === 'invalid' && (
          <p className="rounded-ctl bg-bad-soft px-4 py-3 text-sm text-bad">
            The API answered, but not with a valid health report. Is another program using that port?
          </p>
        )}

        {state.kind === 'ready' && <HealthDetails health={state.health} />}
      </div>
    </section>
  );
}

function HealthDetails({ health }: { health: HealthResponse }) {
  const { database, imageEngine } = health.checks;
  return (
    <ul className="divide-y divide-line">
      <Row label="API server" up detail={`v${health.version} · up ${formatUptime(health.uptimeSeconds)}`} />
      <Row
        label="Database"
        up={database.status === 'up'}
        detail={database.status === 'up' ? `${database.latencyMs ?? 0} ms` : (database.message ?? 'Unavailable')}
      />
      <Row
        label="Image engine"
        up={imageEngine.status === 'up'}
        detail={
          imageEngine.status === 'up'
            ? `sharp ${imageEngine.sharpVersion} · libvips ${imageEngine.libvipsVersion}`
            : (imageEngine.message ?? 'Unavailable')
        }
      />
      {imageEngine.formats && (
        <li className="py-3">
          <p className="mb-2 text-sm font-medium">Formats (read / write)</p>
          <div className="flex flex-wrap gap-2">
            {Object.entries(imageEngine.formats).map(([fmt, s]) => (
              <span
                key={fmt}
                className={`rounded-full px-2.5 py-1 font-mono text-xs uppercase ${
                  s.input && s.output ? 'bg-ok-soft text-ok' : 'bg-bad-soft text-bad'
                }`}
              >
                {fmt} {s.input ? '✓' : '✗'}/{s.output ? '✓' : '✗'}
              </span>
            ))}
          </div>
        </li>
      )}
    </ul>
  );
}

function Row({ label, up, detail }: { label: string; up: boolean; detail: string }) {
  return (
    <li className="flex items-center justify-between gap-4 py-3">
      <span className="flex items-center gap-2 text-sm font-medium">
        {up ? (
          <CheckCircle2 className="size-4 text-ok" aria-hidden="true" />
        ) : (
          <XCircle className="size-4 text-bad" aria-hidden="true" />
        )}
        {label}
        <span className="sr-only">{up ? 'operational' : 'down'}</span>
      </span>
      <span className="text-right text-sm text-ink-muted">{detail}</span>
    </li>
  );
}

function formatUptime(s: number): string {
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
}
