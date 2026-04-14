import { describe, it, expect } from 'vitest';
import { it as fcIt } from '@fast-check/vitest';
import fc from 'fast-check';
import { Money } from '@/shared/money/money';
import { calculateTax } from './tax-rate';
import type { TaxRate } from './tax-rate';

describe('calculateTax', () => {
  it('returns zero when rate is zero', () => {
    const subtotal = Money.fromCents(10000n);
    const result = calculateTax(subtotal, 0 as TaxRate);
    expect(result.cents).toBe(0n);
  });

  it('returns the subtotal when rate is 1 (100%)', () => {
    const subtotal = Money.fromCents(10000n);
    const result = calculateTax(subtotal, 1 as TaxRate);
    expect(result.cents).toBe(10000n);
  });

  it('calculates straightforward non-boundary case', () => {
    // 10000 cents * 10% = 1000 cents exactly
    const subtotal = Money.fromCents(10000n);
    const result = calculateTax(subtotal, 0.1 as TaxRate);
    expect(result.cents).toBe(1000n);
  });

  it('rounds half-cent to even (rounds down when quotient is even)', () => {
    // 1050 cents * 5% = 52.5 cents → quotient 52 is even → round to 52
    const subtotal = Money.fromCents(1050n);
    const result = calculateTax(subtotal, 0.05 as TaxRate);
    expect(result.cents).toBe(52n);
  });

  it('rounds half-cent to even (rounds up when quotient is odd)', () => {
    // 1150 cents * 5% = 57.5 cents → quotient 57 is odd → round to 58
    const subtotal = Money.fromCents(1150n);
    const result = calculateTax(subtotal, 0.05 as TaxRate);
    expect(result.cents).toBe(58n);
  });

  it('handles zero subtotal', () => {
    const result = calculateTax(Money.zero(), 0.15 as TaxRate);
    expect(result.cents).toBe(0n);
  });

  fcIt.prop([
    fc.bigInt({ min: 0n, max: 10_000_000n }),
    fc.double({ min: 0, max: 1, noNaN: true }),
  ])('tax is non-negative and does not exceed subtotal', (cents, rate) => {
    const subtotal = Money.fromCents(cents);
    const tax = calculateTax(subtotal, rate as TaxRate);

    expect(tax.cents).toBeGreaterThanOrEqual(0n);
    expect(tax.cents).toBeLessThanOrEqual(subtotal.cents);
  });
});
