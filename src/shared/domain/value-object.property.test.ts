import { describe, expect } from 'vitest';
import { test as fcTest, fc } from '@fast-check/vitest';
import { z } from 'zod';
import { defineValueObject } from './value-object';

const Slug = defineValueObject('Slug', z.string().min(3));
const Ratio = defineValueObject('Ratio', z.number().min(0).max(1));

const anyValue = fc.oneof(
  fc.string(),
  fc.double({ noNaN: true }),
  fc.integer(),
  fc.boolean(),
  fc.constant(null),
  fc.constant(undefined),
  fc.object(),
);

describe('value object PBT', () => {
  fcTest.prop([anyValue])('is(x) agrees with parse(x).isOk() for a string schema', (x) => {
    expect(Slug.is(x)).toBe(Slug.parse(x).isOk());
  });

  fcTest.prop([anyValue])('is(x) agrees with parse(x).isOk() for a number schema', (x) => {
    expect(Ratio.is(x)).toBe(Ratio.parse(x).isOk());
  });

  fcTest.prop([anyValue])('a failed parse always carries at least one issue', (x) => {
    const result = Slug.parse(x);
    if (result.isErr()) {
      expect(result.error.issues.length).toBeGreaterThan(0);
      expect(result.error.brand).toBe('Slug');
    }
  });
});
