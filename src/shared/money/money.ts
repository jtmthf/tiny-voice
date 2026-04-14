import { ok, err, type Result } from 'neverthrow';

// --- Error types ---

export type MoneyError =
  | { readonly type: 'NegativeAmount'; readonly message: string }
  | { readonly type: 'CurrencyMismatch'; readonly message: string }
  | { readonly type: 'InvalidInput'; readonly message: string };

function currencyMismatch(message: string): MoneyError {
  return { type: 'CurrencyMismatch', message };
}

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

function fromDollars(dollars: number | string): Result<Money, MoneyError> {
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

// --- Namespace-style export ---

export const Money = {
  fromCents,
  fromDollars,
  zero: (): Money => fromCents(0n),
} as const;

// --- Operations ---

function assertSameCurrency(a: Money, b: Money): Result<void, MoneyError> {
  if (a.currency !== b.currency) {
    return err(currencyMismatch(`Cannot combine ${a.currency} and ${b.currency}`));
  }
  return ok(undefined);
}

export function add(a: Money, b: Money): Result<Money, MoneyError> {
  return assertSameCurrency(a, b).map(() => fromCents(a.cents + b.cents));
}

export function subtract(a: Money, b: Money): Result<Money, MoneyError> {
  return assertSameCurrency(a, b).map(() => fromCents(a.cents - b.cents));
}

export function multiply(m: Money, scalar: number): Result<Money, MoneyError> {
  if (!Number.isFinite(scalar)) {
    return err(invalidInput(`Scalar must be finite, got ${scalar}`));
  }
  // Multiply cents by scalar, round to nearest cent using banker's rounding
  const scaled = Number(m.cents) * scalar;
  const rounded = bankersRoundNumber(scaled);
  return ok(fromCents(BigInt(rounded)));
}

/**
 * Banker's rounding for a number to the nearest integer.
 */
function bankersRoundNumber(value: number): number {
  const floor = Math.floor(value);
  const diff = value - floor;
  if (Math.abs(diff - 0.5) < Number.EPSILON) {
    // Half: round to even
    return floor % 2 === 0 ? floor : floor + 1;
  }
  return Math.round(value);
}

export function equals(a: Money, b: Money): boolean {
  return a.currency === b.currency && a.cents === b.cents;
}

/**
 * Returns -1, 0, or 1.
 */
export function compare(a: Money, b: Money): Result<number, MoneyError> {
  return assertSameCurrency(a, b).map(() => {
    if (a.cents < b.cents) return -1;
    if (a.cents > b.cents) return 1;
    return 0;
  });
}
