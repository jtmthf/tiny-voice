/**
 * Banker's rounding (half-to-even) for bigint division.
 *
 * Rounds `value / divisor` to the nearest integer (as bigint),
 * breaking ties by rounding to the nearest even number.
 */
export function bankersRound(value: bigint, divisor: bigint): bigint {
  if (divisor === 0n) {
    throw new RangeError('Division by zero');
  }

  // Handle sign
  const negative = (value < 0n) !== (divisor < 0n);
  const absValue = value < 0n ? -value : value;
  const absDivisor = divisor < 0n ? -divisor : divisor;

  const quotient = absValue / absDivisor;
  const remainder = absValue % absDivisor;

  // Double the remainder to compare with divisor (avoids fractions)
  const doubleRemainder = remainder * 2n;

  let result: bigint;
  if (doubleRemainder > absDivisor) {
    // Round up
    result = quotient + 1n;
  } else if (doubleRemainder < absDivisor) {
    // Round down
    result = quotient;
  } else {
    // Exactly half — round to even
    result = quotient % 2n === 0n ? quotient : quotient + 1n;
  }

  return negative ? -result : result;
}
