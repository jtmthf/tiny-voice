import { describe, expect } from 'vitest';
import { test as fcTest, fc } from '@fast-check/vitest';
import { Money, add, equals } from './money';
import { allocate } from './allocate';
import { bankersRound } from './bankers-round';
import { moneyArbitrary, nonNegativeMoneyArbitrary } from './testing/arbitraries';

describe('Money PBT', () => {
  fcTest.prop([moneyArbitrary, moneyArbitrary])('add is commutative', (a, b) => {
    const ab = add(a, b)._unsafeUnwrap();
    const ba = add(b, a)._unsafeUnwrap();
    expect(equals(ab, ba)).toBe(true);
  });

  fcTest.prop([moneyArbitrary, moneyArbitrary, moneyArbitrary])('add is associative', (a, b, c) => {
    const ab = add(a, b)._unsafeUnwrap();
    const ab_c = add(ab, c)._unsafeUnwrap();

    const bc = add(b, c)._unsafeUnwrap();
    const a_bc = add(a, bc)._unsafeUnwrap();

    expect(equals(ab_c, a_bc)).toBe(true);
  });

  fcTest.prop([moneyArbitrary])('add(m, zero) === m', (m) => {
    const zero = Money.zero();
    const result = add(m, zero)._unsafeUnwrap();
    expect(equals(result, m)).toBe(true);
  });
});

describe('allocate PBT', () => {
  fcTest.prop([
    nonNegativeMoneyArbitrary,
    fc.array(fc.integer({ min: 1, max: 100 }), { minLength: 1, maxLength: 10 }),
  ])('allocate sum equals input', (total, ratios) => {
    const result = allocate(total, ratios)._unsafeUnwrap();
    const sum = result.reduce((s, m) => s + m.cents, 0n);
    expect(sum).toBe(total.cents);
  });
});

describe('bankersRound PBT', () => {
  fcTest.prop([
    fc.bigInt({ min: 0n, max: 10000n }),
  ])('rounds 0.5 to even', (n) => {
    // value = 2n+1, divisor = 2 => quotient n, remainder 1, half
    // If n is even, result should be n; if odd, n+1
    const value = 2n * n + 1n;
    const result = bankersRound(value, 2n);
    // result should be even
    expect(result % 2n).toBe(0n);
  });
});
