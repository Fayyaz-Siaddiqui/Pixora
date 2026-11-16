import type { ErrorCode } from '@app/shared';

/**
 * An error that is safe to show to the client. Anything thrown that is NOT
 * an HttpError is treated as an internal error and its details are hidden.
 */
export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: ErrorCode,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}
