import fc from 'fast-check';
import type { Money } from '../money';

/**
 * Arbitrary for Money values. Generates USD amounts between -$1,000,000 and +$1,000,000.
 */
export const moneyArbitrary: fc.Arbitrary<Money> = fc
  .bigInt({ min: -100_000_000n, max: 100_000_000n })
  .map((cents) => ({ cents, currency: 'USD' as const }));

/**
 * Arbitrary for non-negative Money values.
 */
export const nonNegativeMoneyArbitrary: fc.Arbitrary<Money> = fc
  .bigInt({ min: 0n, max: 100_000_000n })
  .map((cents) => ({ cents, currency: 'USD' as const }));
