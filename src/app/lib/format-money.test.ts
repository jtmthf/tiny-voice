import { describe, expect, it } from 'vitest';
import { Money } from '@/shared/money/money';

describe('Money.toDisplayString', () => {
  it('formats a typical dollar amount', () => {
    expect(Money.toDisplayString(Money.fromCents(12345n))).toBe('$123.45');
  });

  it('pads single-digit cents', () => {
    expect(Money.toDisplayString(Money.fromCents(105n))).toBe('$1.05');
  });

  it('formats zero', () => {
    expect(Money.toDisplayString(Money.fromCents(0n))).toBe('$0.00');
  });

  it('formats negative amounts', () => {
    expect(Money.toDisplayString(Money.fromCents(-1200n))).toBe('-$12.00');
  });

  it('formats large values', () => {
    expect(Money.toDisplayString(Money.fromCents(99999999n))).toBe('$999999.99');
  });

  it('formats sub-dollar amounts', () => {
    expect(Money.toDisplayString(Money.fromCents(7n))).toBe('$0.07');
  });
});
