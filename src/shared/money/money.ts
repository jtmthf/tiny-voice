import { ok, err, type Result } from 'neverthrow';
import { bankersRound } from './bankers-round';

// --- Error types ---

export type MoneyError =
  | { readonly type: 'NegativeAmount'; readonly message: string }
  | { readonly type: 'InvalidInput'; readonly message: string };

function invalidInput(message: string): MoneyError {
  return { type: 'InvalidInput', message };
}

// --- Value type ---

export interface Money {
  readonly cents: bigint;
  readonly currency: 'USD';
}

// --- Factories ---

function fromCents(cents: bigint): Money {
  return { cents, currency: 'USD' };
}

function parseDollarString(dollars: number | string): Result<Money, MoneyError> {
  const str = typeof dollars === 'number' ? dollars.toString() : dollars;

  // Validate format: optional sign, digits, optional decimal with up to 2 places
  const match = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(str.trim());
  if (!match) {
    return err(invalidInput(`Cannot parse "${str}" as dollars. Use format "12.34" with at most 2 decimal places.`));
  }

  const [, signStr, wholeStr, fracRaw] = match;
  const sign = signStr === '-' ? -1n : 1n;
  const wholePart = BigInt(wholeStr ?? '0');
  const fracStr = (fracRaw ?? '').padEnd(2, '0');
  const fracPart = BigInt(fracStr);

  const cents = sign * (wholePart * 100n + fracPart);
  return ok(fromCents(cents));
}

// --- Operations ---
// Single-currency system: `currency: 'USD'` is a literal type, so same-currency
// operations are infallible at the type level. No Result wrapping needed.

function add(a: Money, b: Money): Money {
  return fromCents(a.cents + b.cents);
}

function subtract(a: Money, b: Money): Money {
  return fromCents(a.cents - b.cents);
}

function multiply(m: Money, scalar: number): Result<Money, MoneyError> {
  if (!Number.isFinite(scalar)) {
    return err(invalidInput(`Scalar must be finite, got ${scalar}`));
  }
  // Fast path for integer scalars (e.g. line-item quantity)
  if (Number.isInteger(scalar)) {
    return ok(fromCents(m.cents * BigInt(scalar)));
  }
  // Fractional scalars: compute entirely in bigint to avoid precision loss
  const SCALE = 1_000_000n;
  const scaledScalar = BigInt(Math.round(scalar * 1_000_000));
  const rawCents = m.cents * scaledScalar;
  const rounded = bankersRound(rawCents, SCALE);
  return ok(fromCents(rounded));
}

function equals(a: Money, b: Money): boolean {
  return a.currency === b.currency && a.cents === b.cents;
}

/**
 * Returns -1, 0, or 1.
 */
function compare(a: Money, b: Money): number {
  if (a.cents < b.cents) return -1;
  if (a.cents > b.cents) return 1;
  return 0;
}

// --- Formatting ---

/**
 * Machine-readable dollar string: "123.45" or "-123.45" (no currency symbol).
 * Used for DTO strings and error data.
 */
function toDollarString(m: Money): string {
  const sign = m.cents < 0n ? '-' : '';
  const abs = m.cents < 0n ? -m.cents : m.cents;
  const whole = abs / 100n;
  const frac = abs % 100n;
  return `${sign}${whole}.${frac.toString().padStart(2, '0')}`;
}

/**
 * Human-facing display string: "$123.45" or "-$123.45" (with $ prefix).
 * Used for rendering in UI and PDFs.
 */
function toDisplayString(m: Money): string {
  const sign = m.cents < 0n ? '-' : '';
  const abs = m.cents < 0n ? -m.cents : m.cents;
  const whole = abs / 100n;
  const frac = abs % 100n;
  return `${sign}$${whole}.${frac.toString().padStart(2, '0')}`;
}

/**
 * Infallible multiplication by an integer scalar.
 * Use for line-item quantities and other integer multipliers where
 * non-finite values are impossible by construction.
 *
 * @throws {Error} if `n` is not a safe integer (programming error, not domain error)
 */
function multiplyByInt(m: Money, n: number): Money {
  if (!Number.isInteger(n)) {
    throw new Error(`multiplyByInt requires an integer, got ${n}`);
  }
  return fromCents(m.cents * BigInt(n));
}

// --- Namespace-style export ---

export const Money = {
  fromCents,
  parseDollarString,
  zero: (): Money => fromCents(0n),
  add,
  subtract,
  multiply,
  multiplyByInt,
  equals,
  compare,
  toDollarString,
  toDisplayString,
} as const;
