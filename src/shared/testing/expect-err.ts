import type { Result } from 'neverthrow';

/**
 * Asserts a Result is Err and returns the inner error.
 * Throws a descriptive error if the Result is Ok — use in test assertions
 * that exercise the error branch.
 */
export function expectErr<T, E>(result: Result<T, E>): E {
  return result.match(
    (value) => {
      throw new Error(`Expected Err, got Ok: ${JSON.stringify(value)}`);
    },
    (error) => error,
  );
}
