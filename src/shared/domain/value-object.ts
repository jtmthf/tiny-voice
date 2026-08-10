import type { z } from 'zod';
import { ok, err, type Result } from 'neverthrow';

/**
 * The single error shape for every failed value-object parse.
 * `issues` carries Zod's messages flattened to strings — `ZodError` is a
 * boundary type and must not leak into the domain.
 */
export interface ValueObjectError<TBrand extends string = string> {
  readonly kind: 'InvalidValueObject';
  readonly brand: TBrand;
  readonly raw: unknown;
  readonly issues: readonly string[];
}

/** The branded output type produced by a value object. */
type BrandedOutput<TSchema extends z.ZodType, TBrand extends string> = z.output<TSchema> &
  z.$brand<TBrand>;

export interface ValueObject<TBrand extends string, TSchema extends z.ZodType> {
  readonly brand: TBrand;
  /** Branded schema — use at RPC/event boundaries (AGENTS.md rule 5). */
  readonly schema: z.ZodType<BrandedOutput<TSchema, TBrand>, z.input<TSchema>>;
  /**
   * Result-returning parse — the only sanctioned way to produce the type.
   * Declared as a property, not a method, so it can be re-exported standalone
   * without tripping `@typescript-eslint/no-unbound-method`.
   */
  readonly parse: (raw: unknown) => Result<
    BrandedOutput<TSchema, TBrand>,
    ValueObjectError<TBrand>
  >;
  /**
   * Type guard. Sound only for validating schemas (no value-changing
   * `.transform()`), which is what this kit is for.
   */
  readonly is: (raw: unknown) => raw is BrandedOutput<TSchema, TBrand>;
  /**
   * Bypass validation. ONLY for values already proven valid by construction —
   * DB rows written through `parse`, or generated values. Every call site
   * needs a comment saying which.
   */
  readonly trusted: (value: z.output<TSchema>) => BrandedOutput<TSchema, TBrand>;
}

/**
 * Defines a validated primitive: a branded type, its schema, and a
 * `Result`-returning parser. This is the one convention for value objects —
 * see AGENTS.md. `Money` is the deliberate exception.
 */
export function defineValueObject<TBrand extends string, TSchema extends z.ZodType>(
  brand: TBrand,
  schema: TSchema,
): ValueObject<TBrand, TSchema> {
  type Output = BrandedOutput<TSchema, TBrand>;

  // `.brand<T>()` is a static-only construct (no runtime effect), but its
  // return type does not simplify through the unresolved `TSchema` generic.
  const branded = schema.brand<TBrand>() as unknown as z.ZodType<Output, z.input<TSchema>>;

  return {
    brand,
    schema: branded,
    parse: (raw: unknown): Result<Output, ValueObjectError<TBrand>> => {
      const result = branded.safeParse(raw);
      if (result.success) {
        return ok(result.data);
      }
      return err({
        kind: 'InvalidValueObject',
        brand,
        raw,
        issues: result.error.issues.map((issue) => issue.message),
      });
    },
    is: (raw: unknown): raw is Output => branded.safeParse(raw).success,
    trusted: (value: z.output<TSchema>): Output => value as Output,
  };
}
