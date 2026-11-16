import { randomBytes } from 'node:crypto';
import type { RequestHandler } from 'express';

/**
 * Who owns the request's files. Until accounts exist (Phase 5) every visitor
 * is a guest identified by a random id in a signed, httpOnly cookie. Files
 * are only ever visible to the owner that uploaded them.
 */
export interface Owner {
  userId: string | null;
  guestId: string | null;
}

declare module 'express-serve-static-core' {
  interface Request {
    owner?: Owner;
  }
}

const GUEST_COOKIE = 'gid';
const GUEST_ID = /^[A-Za-z0-9_-]{32}$/;
const THIRTY_DAYS = 30 * 24 * 3600 * 1000;

export function identity(opts: { secureCookies: boolean }): RequestHandler {
  return (req, res, next) => {
    const signed = (req.signedCookies as Record<string, unknown> | undefined)?.[GUEST_COOKIE];
    let guestId = typeof signed === 'string' && GUEST_ID.test(signed) ? signed : null;
    if (!guestId) {
      guestId = randomBytes(24).toString('base64url');
      res.cookie(GUEST_COOKIE, guestId, {
        signed: true,
        httpOnly: true,
        sameSite: 'lax',
        secure: opts.secureCookies,
        maxAge: THIRTY_DAYS,
        path: '/api',
      });
    }
    req.owner = { userId: null, guestId };
    next();
  };
}

export function requireOwner(req: { owner?: Owner }): Owner {
  if (!req.owner) throw new Error('identity middleware not installed');
  return req.owner;
}

/** Prisma filter restricting rows to the current owner. */
export function ownerWhere(owner: Owner): { userId: string } | { userId: null; guestId: string } {
  if (owner.userId) return { userId: owner.userId };
  return { userId: null, guestId: owner.guestId ?? '__none__' };
}
