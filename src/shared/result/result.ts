export { ok, err, Result, ResultAsync, fromThrowable } from 'neverthrow';
export type { Ok, Err } from 'neverthrow';

import { ok, err, Result } from 'neverthrow';

/**
 * Wraps a throwing function into a Result.
 */
export function toResult<T, E>(fn: () => T, mapError: (e: unknown) => E): Result<T, E> {
  try {
    return ok(fn());
  } catch (e) {
    return err(mapError(e));
  }
}

/**
 * Unwraps a Result, returning the fallback on error.
 */
export function unwrapOr<T, E>(result: Result<T, E>, fallback: T): T {
  return result.match(
    (val) => val,
    () => fallback,
  );
}
