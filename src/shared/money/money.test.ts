import { describe, expect, it } from 'vitest';
import { Money } from './money';
import { bankersRound } from './bankers-round';
import { expectOk } from '@/shared/testing/expect-ok';
import { expectErr } from '@/shared/testing/expect-err';

describe('Money.fromCents', () => {
  it('creates a Money with the given cents', () => {
    const m = Money.fromCents(1234n);
    expect(m.cents).toBe(1234n);
    expect(m.currency).toBe('USD');
  });
});

describe('Money.parseDollarString', () => {
  it('parses a string with two decimal places', () => {
    const r = Money.parseDollarString('12.34');
    expect(expectOk(r).cents).toBe(1234n);
  });

  it('parses a string with one decimal place', () => {
    const r = Money.parseDollarString('5.1');
    expect(expectOk(r).cents).toBe(510n);
  });

  it('parses a string with no decimal places', () => {
    const r = Money.parseDollarString('100');
    expect(expectOk(r).cents).toBe(10000n);
  });

  it('parses a number', () => {
    const r = Money.parseDollarString(9.99);
    expect(expectOk(r).cents).toBe(999n);
  });

  it('rejects too many decimal places', () => {
    const r = Money.parseDollarString('12.345');
    expect(expectErr(r).type).toBe('InvalidInput');
  });

  it('rejects non-numeric strings', () => {
    const r = Money.parseDollarString('abc');
    expect(r.isErr()).toBe(true);
  });

  it('handles negative dollar strings', () => {
    const r = Money.parseDollarString('-5.50');
    expect(expectOk(r).cents).toBe(-550n);
  });

  it('handles zero', () => {
    const r = Money.parseDollarString('0');
    expect(expectOk(r).cents).toBe(0n);
  });
});

describe('Money.add / Money.subtract', () => {
  it('adds two Money values', () => {
    const a = Money.fromCents(100n);
    const b = Money.fromCents(250n);
    expect(Money.add(a, b).cents).toBe(350n);
  });

  it('subtracts two Money values', () => {
    const a = Money.fromCents(500n);
    const b = Money.fromCents(200n);
    expect(Money.subtract(a, b).cents).toBe(300n);
  });
});

describe('Money.multiply', () => {
  it('multiplies by a scalar', () => {
    const m = Money.fromCents(100n);
    expect(expectOk(Money.multiply(m, 1.5)).cents).toBe(150n);
  });

  it('rejects non-finite scalars', () => {
    const m = Money.fromCents(100n);
    expect(Money.multiply(m, Infinity).isErr()).toBe(true);
  });

  it('handles integer scalars via fast path', () => {
    const m = Money.fromCents(333n);
    expect(expectOk(Money.multiply(m, 3)).cents).toBe(999n);
  });

  it('handles negative scalars', () => {
    const m = Money.fromCents(100n);
    expect(expectOk(Money.multiply(m, -1.5)).cents).toBe(-150n);
  });
});

describe('Money.multiplyByInt', () => {
  it('multiplies by a positive integer', () => {
    const m = Money.fromCents(333n);
    expect(Money.multiplyByInt(m, 3).cents).toBe(999n);
  });

  it('multiplies by zero', () => {
    const m = Money.fromCents(500n);
    expect(Money.multiplyByInt(m, 0).cents).toBe(0n);
  });

  it('multiplies by a negative integer', () => {
    const m = Money.fromCents(100n);
    expect(Money.multiplyByInt(m, -2).cents).toBe(-200n);
  });

  it('throws for non-integer scalars', () => {
    const m = Money.fromCents(100n);
    expect(() => Money.multiplyByInt(m, 1.5)).toThrow('multiplyByInt requires an integer');
  });

  it('throws for NaN', () => {
    const m = Money.fromCents(100n);
    expect(() => Money.multiplyByInt(m, NaN)).toThrow('multiplyByInt requires an integer');
  });

  it('throws for Infinity', () => {
    const m = Money.fromCents(100n);
    expect(() => Money.multiplyByInt(m, Infinity)).toThrow('multiplyByInt requires an integer');
  });
});

describe('Money.toDollarString', () => {
  it('formats positive amounts', () => {
    expect(Money.toDollarString(Money.fromCents(12345n))).toBe('123.45');
  });

  it('formats zero', () => {
    expect(Money.toDollarString(Money.fromCents(0n))).toBe('0.00');
  });

  it('formats negative amounts', () => {
    expect(Money.toDollarString(Money.fromCents(-1200n))).toBe('-12.00');
  });

  it('pads single-digit cents', () => {
    expect(Money.toDollarString(Money.fromCents(7n))).toBe('0.07');
  });
});

describe('Money.toDisplayString', () => {
  it('formats positive amounts with $', () => {
    expect(Money.toDisplayString(Money.fromCents(12345n))).toBe('$123.45');
  });

  it('formats zero with $', () => {
    expect(Money.toDisplayString(Money.fromCents(0n))).toBe('$0.00');
  });

  it('formats negative amounts with -$', () => {
    expect(Money.toDisplayString(Money.fromCents(-1200n))).toBe('-$12.00');
  });

  it('pads single-digit cents', () => {
    expect(Money.toDisplayString(Money.fromCents(7n))).toBe('$0.07');
  });

  it('formats large values', () => {
    expect(Money.toDisplayString(Money.fromCents(99999999n))).toBe('$999999.99');
  });
});

describe('Money.equals / Money.compare', () => {
  it('equals returns true for same value', () => {
    expect(Money.equals(Money.fromCents(100n), Money.fromCents(100n))).toBe(true);
  });

  it('equals returns false for different values', () => {
    expect(Money.equals(Money.fromCents(100n), Money.fromCents(200n))).toBe(false);
  });

  it('compare returns -1, 0, 1', () => {
    expect(Money.compare(Money.fromCents(100n), Money.fromCents(200n))).toBe(-1);
    expect(Money.compare(Money.fromCents(200n), Money.fromCents(200n))).toBe(0);
    expect(Money.compare(Money.fromCents(300n), Money.fromCents(200n))).toBe(1);
  });
});

describe('bankersRound', () => {
  it('rounds down when remainder < half', () => {
    expect(bankersRound(1n, 4n)).toBe(0n);
  });

  it('rounds up when remainder > half', () => {
    expect(bankersRound(3n, 4n)).toBe(1n);
  });

  it('rounds to even on exact half (even quotient)', () => {
    // 1/2 = 0.5 — quotient 0 is even, stays 0
    expect(bankersRound(1n, 2n)).toBe(0n);
  });

  it('rounds to even on exact half (odd quotient)', () => {
    // 3/2 = 1.5 — quotient 1 is odd, rounds to 2
    expect(bankersRound(3n, 2n)).toBe(2n);
  });

  it('throws on division by zero', () => {
    expect(() => bankersRound(1n, 0n)).toThrow('Division by zero');
  });
});
