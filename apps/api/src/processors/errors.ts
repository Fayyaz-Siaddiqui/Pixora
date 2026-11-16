import { ErrorCode } from '@app/shared';

/** A processing failure with a user-safe message and a stable code. */
export class ProcessingError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = 'ProcessingError';
  }
}

/** Translate libvips/sharp errors into user-safe errors without leaking internals. */
export function classifySharpError(err: unknown): ProcessingError {
  if (err instanceof ProcessingError) return err;
  const msg = err instanceof Error ? err.message : String(err);
  if (/pixel limit|exceeds pixel/i.test(msg)) {
    return new ProcessingError(ErrorCode.IMAGE_TOO_LARGE, 'The image has more pixels than the allowed limit.', { cause: err });
  }
  if (/timeout/i.test(msg)) {
    return new ProcessingError(ErrorCode.PROCESSING_TIMEOUT, 'Processing took too long and was stopped. Try a smaller image or fewer steps.', { cause: err });
  }
  if (/unsupported image format|bad seek|premature end|corrupt|invalid|truncat|VipsJpeg|png: |webp: |heif: |read error/i.test(msg)) {
    return new ProcessingError(ErrorCode.CORRUPT_IMAGE, 'The image file appears to be damaged or incomplete.', { cause: err });
  }
  if (/memory|alloc/i.test(msg)) {
    return new ProcessingError(ErrorCode.PROCESSING_FAILED, 'The server ran out of memory processing this image. Try a smaller image.', { cause: err });
  }
  return new ProcessingError(ErrorCode.PROCESSING_FAILED, 'The image could not be processed.', { cause: err });
}
