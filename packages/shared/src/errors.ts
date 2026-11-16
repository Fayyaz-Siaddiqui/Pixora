import { z } from 'zod';

/**
 * Stable, machine-readable error codes returned by the API. The frontend
 * maps these to helpful messages; internal details (stack traces, file paths,
 * SQL) are never sent to clients.
 */
export const ErrorCode = {
  BAD_REQUEST: 'BAD_REQUEST',
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  PAYLOAD_TOO_LARGE: 'PAYLOAD_TOO_LARGE',
  UNSUPPORTED_FORMAT: 'UNSUPPORTED_FORMAT',
  CORRUPT_IMAGE: 'CORRUPT_IMAGE',
  IMAGE_TOO_LARGE: 'IMAGE_TOO_LARGE',
  INVALID_DIMENSIONS: 'INVALID_DIMENSIONS',
  RATE_LIMITED: 'RATE_LIMITED',
  QUOTA_EXCEEDED: 'QUOTA_EXCEEDED',
  PROCESSING_FAILED: 'PROCESSING_FAILED',
  PROCESSING_TIMEOUT: 'PROCESSING_TIMEOUT',
  AI_UNAVAILABLE: 'AI_UNAVAILABLE',
  STORAGE_ERROR: 'STORAGE_ERROR',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

export const apiErrorSchema = z.object({
  error: z.object({
    code: z.enum(Object.values(ErrorCode) as [ErrorCode, ...ErrorCode[]]),
    message: z.string(),
    requestId: z.string().optional(),
    details: z.unknown().optional(),
  }),
});

export type ApiErrorBody = z.infer<typeof apiErrorSchema>;
