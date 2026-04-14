import { ok, err, Result } from 'neverthrow';
import type { Money, MoneyError } from './money';

/**
 * Splits `total` across `ratios`, distributing remainder pennies
 * so the sum of results equals `total` exactly.
 *
 * Largest-remainder method: allocate floor amounts first,
 * then distribute leftover pennies to entries with the largest fractional parts.
 */
export function allocate(total: Money, ratios: number[]): Result<Money[], MoneyError> {
  if (ratios.length === 0) {
    return err({ type: 'InvalidInput', message: 'Ratios array must not be empty' });
  }

  const sum = ratios.reduce((a, b) => a + b, 0);
  if (sum <= 0 || !Number.isFinite(sum)) {
    return err({ type: 'InvalidInput', message: `Ratios must sum to a positive finite number, got ${sum}` });
  }

  if (ratios.some((r) => r < 0)) {
    return err({ type: 'InvalidInput', message: 'Ratios must be non-negative' });
  }

  const totalCents = total.cents;
  const isNeg = totalCents < 0n;
  const absCents = isNeg ? -totalCents : totalCents;

  // Compute ideal (fractional) allocation for each ratio
  const idealAllocations = ratios.map((r) => (Number(absCents) * r) / sum);
  const floors = idealAllocations.map((a) => BigInt(Math.floor(a)));
  const remainders = idealAllocations.map((a, i) => a - Number(floors[i] ?? 0n));

  const allocated = floors.reduce((a, b) => a + b, 0n);
  let leftover = absCents - allocated;

  // Sort indices by remainder descending, distribute leftover pennies
  const indices = remainders
    .map((r, i) => ({ r, i }))
    .sort((a, b) => b.r - a.r)
    .map((x) => x.i);

  for (const idx of indices) {
    if (leftover <= 0n) break;
    floors[idx] = (floors[idx] ?? 0n) + 1n;
    leftover -= 1n;
  }

  const results: Money[] = floors.map((c) => ({
    cents: isNeg ? -c : c,
    currency: total.currency,
  }));

  return ok(results);
}
