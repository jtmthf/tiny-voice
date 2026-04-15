import { describe, expect } from 'vitest';
import { test as fcTest, fc } from '@fast-check/vitest';
import { Money } from './money';
import { bankersRound } from './bankers-round';
import { moneyArbitrary } from './testing/arbitraries';

describe('Money PBT', () => {
  fcTest.prop([moneyArbitrary, moneyArbitrary])('add is commutative', (a, b) => {
    const ab = Money.add(a, b);
    const ba = Money.add(b, a);
    expect(Money.equals(ab, ba)).toBe(true);
  });

  fcTest.prop([moneyArbitrary, moneyArbitrary, moneyArbitrary])('add is associative', (a, b, c) => {
    const ab = Money.add(a, b);
    const ab_c = Money.add(ab, c);

    const bc = Money.add(b, c);
    const a_bc = Money.add(a, bc);

    expect(Money.equals(ab_c, a_bc)).toBe(true);
  });

  fcTest.prop([moneyArbitrary])('add(m, zero) === m', (m) => {
    const zero = Money.zero();
    const result = Money.add(m, zero);
    expect(Money.equals(result, m)).toBe(true);
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
