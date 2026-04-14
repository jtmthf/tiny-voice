import { z } from 'zod/v4';
import { bankersRound } from '@/shared/money/bankers-round';
import type { Money } from '@/shared/money/money';
import { Money as MoneyFactory } from '@/shared/money/money';

/**
 * Fractional tax rate in range [0, 1].
 * Example: 0.075 for 7.5% tax.
 */
export type TaxRate = number & { readonly __brand: 'TaxRate' };

export const TaxRateSchema = z
  .number()
  .min(0, 'Tax rate must be >= 0')
  .max(1, 'Tax rate must be <= 1')
  .transform((val) => val as TaxRate);

/**
 * Calculates the tax on a subtotal using banker's rounding.
 * Returns tax amount in the same currency as subtotal.
 */
export function calculateTax(subtotal: Money, rate: TaxRate): Money {
  if (rate === 0) return MoneyFactory.zero();
  // Multiply cents by rate (as integer numerator / denominator) using banker's rounding.
  // rate is a float in [0,1]. Convert to integer math:
  // tax = subtotal.cents * rate, rounded via banker's rounding.
  // We scale rate to avoid float precision: multiply by 1_000_000, then divide result.
  const SCALE = 1_000_000n;
  const scaledRate = BigInt(Math.round(rate * 1_000_000));
  const rawCents = subtotal.cents * scaledRate;
  const taxCents = bankersRound(rawCents, SCALE);
  return MoneyFactory.fromCents(taxCents);
}
