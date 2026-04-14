import { z } from 'zod/v4';
import type { ORPCErrorConstructorMap } from '@orpc/server';
import type { InvoiceError } from '@/invoicing/errors/invoice-error';
import type { CreateClientError } from '@/clients/commands/create-client';

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

export type RpcErrors = ORPCErrorConstructorMap<typeof rpcErrors>;

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

/**
 * Maps a domain InvoiceError to the matching oRPC error code + data,
 * ready to be thrown via the `errors` constructor map in a handler.
 */
export function mapInvoiceError(
  err: InvoiceError,
  errors: RpcErrors,
): never {
  switch (err.kind) {
    case 'InvalidTransition':
      throw errors.INVALID_TRANSITION({ data: { from: err.from, to: err.to } });
    case 'Overpayment':
      throw errors.OVERPAYMENT({
        data: {
          attempted: centsToDollars(err.attempted.cents),
          outstanding: centsToDollars(err.outstanding.cents),
        },
      });
    case 'AlreadyPaid':
      throw errors.ALREADY_PAID();
    case 'InvoiceVoided':
      throw errors.INVOICE_VOIDED();
    case 'NoLineItems':
      throw errors.NO_LINE_ITEMS();
    case 'ConcurrencyConflict':
      throw errors.CONCURRENCY_CONFLICT();
    case 'InvalidInput':
      throw errors.INVALID_INPUT({ data: { reason: err.reason } });
    case 'NotOverdue':
      throw errors.NOT_OVERDUE();
    case 'LateFeeAlreadyApplied':
      throw errors.LATE_FEE_ALREADY_APPLIED();
  }
}

/**
 * Maps a domain CreateClientError to the matching oRPC error.
 */
export function mapClientError(
  err: CreateClientError,
  errors: RpcErrors,
): never {
  switch (err.kind) {
    case 'NameTooShort':
      throw errors.NAME_TOO_SHORT();
    case 'NameTooLong':
      throw errors.NAME_TOO_LONG();
    case 'InvalidEmail':
      throw errors.INVALID_EMAIL({ data: { reason: `Invalid email: ${err.raw}` } });
  }
}
