import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Signed download links.
 *
 * Download URLs end with the real file name (".../photo-800x600.webp") and
 * carry an expiring HMAC signature instead of relying on the visitor cookie.
 * This makes downloads work everywhere: browsers that ignore the `download`
 * attribute, and download managers (e.g. IDM) that re-request the URL
 * without the browser's cookies and name the file after the URL path.
 *
 * Only someone who received the link from the API can use it, and only
 * until it expires.
 */

let secret: Buffer | null = null;

/** Called once at startup with a server secret (the cookie secret). */
export function configureDownloadLinks(signingSecret: string): void {
  secret = createHmac('sha256', signingSecret).update('download-links/v1').digest();
}

type Subject = 'image' | 'batch';

function sign(subject: Subject, id: string, exp: number): string {
  if (!secret) throw new Error('configureDownloadLinks() was not called');
  return createHmac('sha256', secret).update(`${subject}:${id}:${exp}`).digest('base64url').slice(0, 32);
}

/**
 * Links are valid until the end of the NEXT full hour (1-2 h), so the same
 * link is returned for a whole hour; repeated status polls don't produce
 * new URLs, which keeps browser caching and React rendering stable.
 */
function expiry(now = Date.now()): number {
  return (Math.floor(now / 3_600_000) + 2) * 3600;
}

/** URL-safe last path segment that still shows the real name and extension. */
function pathName(name: string): string {
  return encodeURIComponent(name.replace(/[\\/]/g, '_'));
}

export function signedDownloadUrl(subject: Subject, id: string, fileName: string): string {
  const exp = expiry();
  const base = subject === 'image' ? `/api/files/${id}` : `/api/files/batch/${id}`;
  return `${base}/${pathName(fileName)}?exp=${exp}&sig=${sign(subject, id, exp)}`;
}

/** True when the signature is valid for this subject and has not expired. */
export function verifyDownload(subject: Subject, id: string, exp: unknown, sig: unknown): boolean {
  if (typeof exp !== 'string' || typeof sig !== 'string' || !/^\d{1,12}$/.test(exp)) return false;
  const expires = Number(exp);
  if (expires * 1000 < Date.now()) return false;
  const expected = Buffer.from(sign(subject, id, expires));
  const given = Buffer.from(sig);
  return given.length === expected.length && timingSafeEqual(given, expected);
}
