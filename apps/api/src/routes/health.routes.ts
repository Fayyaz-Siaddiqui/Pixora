import { Router } from 'express';
import { getHealth, type DatabaseCheck } from '../services/health.service';

export function healthRoutes(dbCheck: DatabaseCheck, version: string): Router {
  const router = Router();

  /** Liveness: the process is running. Used by container orchestrators. */
  router.get('/live', (_req, res) => {
    res.json({ status: 'ok' });
  });

  /** Readiness + diagnostics: 503 when a dependency is down so load balancers stop routing here. */
  router.get('/', async (_req, res) => {
    const health = await getHealth(dbCheck, version);
    res.status(health.status === 'ok' ? 200 : 503).set('Cache-Control', 'no-store').json(health);
  });

  return router;
}
