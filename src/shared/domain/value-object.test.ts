import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { defineValueObject } from './value-object';
import { expectOk } from '@/shared/testing/expect-ok';
import { expectErr } from '@/shared/testing/expect-err';

const Slug = defineValueObject('Slug', z.string().min(3, 'Slug must be at least 3 characters'));
type Slug = z.infer<typeof Slug.schema>;

const Ratio = defineValueObject('Ratio', z.number().min(0).max(1));

describe('defineValueObject', () => {
  it('exposes the brand it was defined with', () => {
    expect(Slug.brand).toBe('Slug');
  });

  it('parse returns Ok with the value for valid input', () => {
    expect(expectOk(Slug.parse('invoices'))).toBe('invoices');
  });

  it('parse returns Err describing the failure for invalid input', () => {
    const error = expectErr(Slug.parse('ab'));
    expect(error).toEqual({
      kind: 'InvalidValueObject',
      brand: 'Slug',
      raw: 'ab',
      issues: ['Slug must be at least 3 characters'],
    });
  });

  it('parse returns Err with a non-empty issues list for a wrong-typed input', () => {
    const error = expectErr(Ratio.parse('not a number'));
    expect(error.kind).toBe('InvalidValueObject');
    expect(error.brand).toBe('Ratio');
    expect(error.raw).toBe('not a number');
    expect(error.issues.length).toBeGreaterThan(0);
  });

  it('is returns true and narrows for a valid value', () => {
    const raw: unknown = 'invoices';
    expect(Slug.is(raw)).toBe(true);
    if (Slug.is(raw)) {
      // Narrowed to the branded type — assignable to a Slug-typed binding.
      const slug: Slug = raw;
      expect(slug).toBe('invoices');
    }
  });

  it('is returns false for an invalid value', () => {
    expect(Slug.is('ab')).toBe(false);
    expect(Slug.is(42)).toBe(false);
    expect(Ratio.is(1.5)).toBe(false);
  });

  it('trusted is the identity at runtime', () => {
    expect(Slug.trusted('invoices')).toBe('invoices');
    expect(Ratio.trusted(0.25)).toBe(0.25);
  });

  it('brands are not mutually assignable', () => {
    const Other = defineValueObject('Other', z.string().min(3));
    const slug = expectOk(Slug.parse('invoices'));
    const other = expectOk(Other.parse('invoices'));

    // @ts-expect-error Slug and Other share a base type but not a brand.
    const notASlug: Slug = other;
    // @ts-expect-error a bare string is not a Slug — it must be parsed.
    const alsoNotASlug: Slug = 'invoices';

    expect(notASlug).toBe(slug);
    expect(alsoNotASlug).toBe(slug);
  });
});
