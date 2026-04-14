import { z } from 'zod/v4';
import type { InvoiceError } from '@/invoicing/index';
import type { CreateClientError } from '@/clients/index';

/**
 * oRPC typed error definitions.
 * Each key is an error code that maps to the domain error variants.
 */
export const rpcErrors = {
  INVOICE_NOT_FOUND: { status: 404, message: 'Invoice not found' },
  INVALID_TRANSITION: {
    data: z.object({ from: z.string(), to: z.string() }),
  },
  OVERPAYMENT: {
    data: z.object({ attempted: z.string(), outstanding: z.string() }),
  },
  ALREADY_PAID: { message: 'Invoice is already fully paid' },
  INVOICE_VOIDED: { message: 'Invoice has been voided' },
  NO_LINE_ITEMS: { message: 'Invoice has no line items' },
  CONCURRENCY_CONFLICT: { status: 409, message: 'Concurrency conflict' },
  INVALID_INPUT: { data: z.object({ reason: z.string() }) },
  CLIENT_NOT_FOUND: { status: 404, message: 'Client not found' },
  VALIDATION_FAILED: { data: z.object({ reason: z.string() }) },
  PDF_GENERATION_FAILED: { data: z.object({ reason: z.string() }) },
  NAME_TOO_SHORT: { message: 'Client name is too short' },
  NAME_TOO_LONG: { message: 'Client name is too long' },
  INVALID_EMAIL: { data: z.object({ reason: z.string() }) },
  FEATURE_DISABLED: { message: 'Feature is disabled' },
  NOT_OVERDUE: { message: 'Invoice is not overdue' },
  LATE_FEE_ALREADY_APPLIED: { message: 'Late fee has already been applied to this invoice' },
} as const;

/**
 * Formats a bigint cents value as a dollar string (e.g., 12345n -> "123.45").
 */
function centsToDollars(cents: bigint): string {
  const sign = cents < 0n ? '-' : '';
  const abs = cents < 0n ? -cents : cents;
  const whole = abs / 100n;
  const frac = abs % 100n;
  return `${sign}${whole}.${frac.toString().padStart(2, '0')}`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ErrorConstructors = Record<string, (opts?: any) => never>;

function throwError(e: ErrorConstructors, code: string, opts?: Record<string, unknown>): never {
  const ctor = e[code];
  if (!ctor) throw new Error(`Unknown error code: ${code}`);
  throw ctor(opts);
}

/**
 * Maps a domain InvoiceError to the matching oRPC error code + data,
 * ready to be thrown via the `errors` constructor map in a handler.
 */
export function mapInvoiceError(
  err: InvoiceError,
  errors: ErrorConstructors,
): never {
  switch (err.kind) {
    case 'InvalidTransition':
      throwError(errors, 'INVALID_TRANSITION', { data: { from: err.from, to: err.to } });
      break; // unreachable, satisfies TS
    case 'Overpayment':
      throwError(errors, 'OVERPAYMENT', {
        data: {
          attempted: centsToDollars(err.attempted.cents),
          outstanding: centsToDollars(err.outstanding.cents),
        },
      });
      break;
    case 'AlreadyPaid':
      throwError(errors, 'ALREADY_PAID');
      break;
    case 'InvoiceVoided':
      throwError(errors, 'INVOICE_VOIDED');
      break;
    case 'NoLineItems':
      throwError(errors, 'NO_LINE_ITEMS');
      break;
    case 'ConcurrencyConflict':
      throwError(errors, 'CONCURRENCY_CONFLICT');
      break;
    case 'InvalidInput':
      throwError(errors, 'INVALID_INPUT', { data: { reason: err.reason } });
      break;
    case 'NotOverdue':
      throwError(errors, 'NOT_OVERDUE');
      break;
    case 'LateFeeAlreadyApplied':
      throwError(errors, 'LATE_FEE_ALREADY_APPLIED');
      break;
  }
}

/**
 * Maps a domain CreateClientError to the matching oRPC error.
 */
export function mapClientError(
  err: CreateClientError,
  errors: ErrorConstructors,
): never {
  switch (err.kind) {
    case 'NameTooShort':
      throwError(errors, 'NAME_TOO_SHORT');
      break;
    case 'NameTooLong':
      throwError(errors, 'NAME_TOO_LONG');
      break;
    case 'InvalidEmail':
      throwError(errors, 'INVALID_EMAIL', { data: { reason: `Invalid email: ${err.raw}` } });
      break;
  }
}
