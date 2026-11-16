import type { RequestHandler } from 'express';
import { ErrorCode } from '@app/shared';
import { HttpError } from '../lib/http-error';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * CSRF defence for cookie-authenticated requests. Browsers always send an
 * Origin header on cross-site POST/PUT/DELETE; if it is present it must be
 * one of our web origins. Combined with SameSite=Lax cookies and the CORS
 * allow-list, a foreign site cannot make state-changing requests as the user.
 */
export function originCheck(allowedOrigins: string[]): RequestHandler {
  const allowed = new Set(allowedOrigins);
  return (req, _res, next) => {
    if (SAFE_METHODS.has(req.method)) return next();
    const origin = req.get('origin');
    if (origin && !allowed.has(origin)) {
      return next(new HttpError(403, ErrorCode.FORBIDDEN, 'Request origin is not allowed.'));
    }
    next();
  };
}
