import type { Result } from 'neverthrow';

/**
 * Asserts a Result is Ok and returns the inner value.
 * Throws a descriptive error if the Result is Err — use in test factories
 * and test setup where the inputs are known-valid.
 */
export function expectOk<T, E>(result: Result<T, E>): T {
  return result.match(
    (value) => value,
    (error) => {
      throw new Error(`Expected Ok, got Err: ${JSON.stringify(error)}`);
    },
  );
}
