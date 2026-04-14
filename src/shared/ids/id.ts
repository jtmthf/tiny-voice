import { z } from 'zod/v4';
import { v7 as uuidv7 } from 'uuid';

/**
 * Branded ID type with a runtime-validated prefix (e.g. "client_01961f3d-...").
 * The prefix makes IDs self-describing and validates at runtime, not just compile-time.
 */
export type Id<Prefix extends string> = string & { readonly __brand: Prefix };

/**
 * Creates a factory function that mints new prefixed branded UUIDs (v7, time-sortable).
 */
export function newId<P extends string>(prefix: P): () => Id<P> {
  return () => `${prefix}_${uuidv7()}` as Id<P>;
}

/**
 * Parse and validate a prefixed ID string at runtime.
 * Throws if the prefix doesn't match or the UUID portion is invalid.
 */
export function parseId<P extends string>(prefix: P, value: string): Id<P> {
  const expectedPrefix = `${prefix}_`;
  if (!value.startsWith(expectedPrefix)) {
    throw new Error(`Expected ${prefix}_ prefix, got: ${value}`);
  }
  const uuid = value.slice(expectedPrefix.length);
  const result = z.uuid().safeParse(uuid);
  if (!result.success) {
    throw new Error(`Invalid UUID in ${prefix} ID: ${value}`);
  }
  return value as Id<P>;
}

/**
 * Strip the prefix for DB storage (bare UUID).
 */
export function toDb(id: Id<string>): string {
  const idx = id.indexOf('_');
  return idx === -1 ? id : id.slice(idx + 1);
}

/**
 * Reconstitute a prefixed ID from a bare DB UUID.
 * Use only when hydrating from a trusted source (DB rows).
 */
export function fromDb<P extends string>(prefix: P, raw: string): Id<P> {
  return `${prefix}_${raw}` as Id<P>;
}

/**
 * Build a Zod schema that validates a prefixed ID string.
 */
export function prefixedIdSchema<P extends string>(prefix: P) {
  return z
    .string()
    .check(
      z.refine((val) => {
        const expectedPrefix = `${prefix}_`;
        if (!val.startsWith(expectedPrefix)) return false;
        return z.uuid().safeParse(val.slice(expectedPrefix.length)).success;
      }, `Expected a valid ${prefix}_ prefixed ID`),
    )
    .transform((val) => val as Id<P>);
}
