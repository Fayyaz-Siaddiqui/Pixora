import type { z } from 'zod';
import { ErrorCode } from '@app/shared';
import { HttpError } from './http-error';

/** Parse request input with zod; failures become a 400 with field-level details. */
export function parseInput<S extends z.ZodType>(schema: S, value: unknown): z.infer<S> {
  const result = schema.safeParse(value);
  if (!result.success) {
    const details = result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
    const first = details[0];
    throw new HttpError(
      400,
      ErrorCode.VALIDATION_FAILED,
      first ? `Invalid request: ${first.path ? `${first.path}: ` : ''}${first.message}` : 'Invalid request.',
      details,
    );
  }
  return result.data;
}
