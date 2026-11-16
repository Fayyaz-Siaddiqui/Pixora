import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ErrorCode, type ApiErrorBody } from '@app/shared';
import { HttpError } from '../lib/http-error';

export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(new HttpError(404, ErrorCode.NOT_FOUND, `No API route for ${req.method} ${req.path}.`));
};

/**
 * Central error handler. Known HttpErrors are returned as-is; everything else
 * is logged with full detail server-side and returned as a generic 500.
 */
export const errorHandler: ErrorRequestHandler = (err: unknown, req, res, _next) => {
  const requestId = String(req.id ?? '');

  let status = 500;
  let body: ApiErrorBody;

  if (err instanceof HttpError) {
    status = err.status;
    body = { error: { code: err.code, message: err.message, requestId, details: err.details } };
  } else if (isBodyParserError(err)) {
    status = err.status;
    body = {
      error: {
        code: err.status === 413 ? ErrorCode.PAYLOAD_TOO_LARGE : ErrorCode.BAD_REQUEST,
        message: err.status === 413 ? 'Request body is too large.' : 'Malformed request body.',
        requestId,
      },
    };
  } else {
    body = {
      error: { code: ErrorCode.INTERNAL_ERROR, message: 'Something went wrong on our side. Please try again.', requestId },
    };
  }

  if (status >= 500) req.log.error({ err }, 'request failed');
  else req.log.warn({ code: body.error.code, status }, body.error.message);

  if (res.headersSent) return;
  res.status(status).json(body);
};

function isBodyParserError(err: unknown): err is { status: number; type: string } {
  return (
    typeof err === 'object' && err !== null &&
    'type' in err && typeof (err as { type: unknown }).type === 'string' &&
    'status' in err && typeof (err as { status: unknown }).status === 'number' &&
    (err as { status: number }).status < 500
  );
}
