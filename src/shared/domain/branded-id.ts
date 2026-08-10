import { z } from 'zod';
import { v7 as uuidv7 } from 'uuid';
import type { Result } from 'neverthrow';
import { defineValueObject, type ValueObjectError } from './value-object';

/**
 * Branded ID type with a runtime-validated prefix (e.g. "client_01961f3d-...").
 * The prefix makes IDs self-describing and validates at runtime, not just compile-time.
 */
export type Id<Prefix extends string> = string & z.$brand<Prefix>;

export interface BrandedId<TPrefix extends string> {
  readonly prefix: TPrefix;
  /** Branded schema — use at RPC/event boundaries (AGENTS.md rule 5). */
  readonly schema: z.ZodType<Id<TPrefix>, string>;
  /** Mints a new prefixed UUID (v7, time-sortable). */
  readonly create: () => Id<TPrefix>;
  /** Result-returning parse. Rejects a wrong prefix or a malformed UUID. */
  readonly parse: (raw: unknown) => Result<Id<TPrefix>, ValueObjectError<TPrefix>>;
  readonly is: (raw: unknown) => raw is Id<TPrefix>;
  /** Strips the prefix for DB storage (bare UUID). */
  readonly toDb: (id: Id<TPrefix>) => string;
  /** Reconstitutes a prefixed ID from a bare DB UUID. Trusted sources only. */
  readonly fromDb: (raw: string) => Id<TPrefix>;
}

/**
 * Defines an ID family for one prefix: minting, parsing, a schema, and the
 * DB round-trip. The one convention for branded IDs — see AGENTS.md.
 */
export function defineBrandedId<TPrefix extends string>(prefix: TPrefix): BrandedId<TPrefix> {
  const expectedPrefix = `${prefix}_`;
  const valueObject = defineValueObject(
    prefix,
    z.string().check(
      z.refine((val) => {
        if (!val.startsWith(expectedPrefix)) return false;
        return z.uuid().safeParse(val.slice(expectedPrefix.length)).success;
      }, `Expected a valid ${prefix}_ prefixed ID`),
    ),
  );

  return {
    prefix,
    schema: valueObject.schema,
    // uuidv7() emits a well-formed UUID by construction.
    create: () => valueObject.trusted(`${prefix}_${uuidv7()}`),
    parse: valueObject.parse,
    is: valueObject.is,
    toDb: (id) => toDb(id),
    fromDb: (raw) => fromDb(prefix, raw),
  };
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
 * Use only when hydrating from a trusted source (DB rows), which were written
 * through a parsed ID and so are valid by construction.
 */
export function fromDb<P extends string>(prefix: P, raw: string): Id<P> {
  return `${prefix}_${raw}` as Id<P>;
}
