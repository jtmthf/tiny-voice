import { describe, expect, it } from 'vitest';
import { Money, add, subtract, multiply, equals, compare } from './money';
import { bankersRound } from './bankers-round';

describe('Money.fromCents', () => {
  it('creates a Money with the given cents', () => {
    const m = Money.fromCents(1234n);
    expect(m.cents).toBe(1234n);
    expect(m.currency).toBe('USD');
  });
});

describe('Money.fromDollars', () => {
  it('parses a string with two decimal places', () => {
    const r = Money.fromDollars('12.34');
    expect(r._unsafeUnwrap().cents).toBe(1234n);
  });

  it('parses a string with one decimal place', () => {
    const r = Money.fromDollars('5.1');
    expect(r._unsafeUnwrap().cents).toBe(510n);
  });

  it('parses a string with no decimal places', () => {
    const r = Money.fromDollars('100');
    expect(r._unsafeUnwrap().cents).toBe(10000n);
  });

  it('parses a number', () => {
    const r = Money.fromDollars(9.99);
    expect(r._unsafeUnwrap().cents).toBe(999n);
  });

  it('rejects too many decimal places', () => {
    const r = Money.fromDollars('12.345');
    expect(r.isErr()).toBe(true);
    expect(r._unsafeUnwrapErr().type).toBe('InvalidInput');
  });

  it('rejects non-numeric strings', () => {
    const r = Money.fromDollars('abc');
    expect(r.isErr()).toBe(true);
  });

  it('handles negative dollar strings', () => {
    const r = Money.fromDollars('-5.50');
    expect(r._unsafeUnwrap().cents).toBe(-550n);
  });

  it('handles zero', () => {
    const r = Money.fromDollars('0');
    expect(r._unsafeUnwrap().cents).toBe(0n);
  });
});

describe('add / subtract', () => {
  it('adds two Money values', () => {
    const a = Money.fromCents(100n);
    const b = Money.fromCents(250n);
    expect(add(a, b)._unsafeUnwrap().cents).toBe(350n);
  });

  it('subtracts two Money values', () => {
    const a = Money.fromCents(500n);
    const b = Money.fromCents(200n);
    expect(subtract(a, b)._unsafeUnwrap().cents).toBe(300n);
  });
});

describe('multiply', () => {
  it('multiplies by a scalar', () => {
    const m = Money.fromCents(100n);
    expect(multiply(m, 1.5)._unsafeUnwrap().cents).toBe(150n);
  });

  it('rejects non-finite scalars', () => {
    const m = Money.fromCents(100n);
    expect(multiply(m, Infinity).isErr()).toBe(true);
  });
});

describe('comparison / predicates', () => {
  it('equals returns true for same value', () => {
    expect(equals(Money.fromCents(100n), Money.fromCents(100n))).toBe(true);
  });

  it('equals returns false for different values', () => {
    expect(equals(Money.fromCents(100n), Money.fromCents(200n))).toBe(false);
  });

  it('compare returns -1, 0, 1', () => {
    expect(compare(Money.fromCents(100n), Money.fromCents(200n))._unsafeUnwrap()).toBe(-1);
    expect(compare(Money.fromCents(200n), Money.fromCents(200n))._unsafeUnwrap()).toBe(0);
    expect(compare(Money.fromCents(300n), Money.fromCents(200n))._unsafeUnwrap()).toBe(1);
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
