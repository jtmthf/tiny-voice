import { z } from 'zod/v4';
import type { ORPCErrorConstructorMap } from '@orpc/server';
import { Money } from '@/shared/money/money';
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
 * Maps a domain InvoiceError to the matching oRPC error instance.
 * The caller is responsible for throwing the returned error.
 */
export function mapInvoiceError(
  err: InvoiceError,
  errors: RpcErrors,
): Error {
  switch (err.kind) {
    case 'InvalidTransition':
      return errors.INVALID_TRANSITION({ data: { from: err.from, to: err.to } });
    case 'Overpayment':
      return errors.OVERPAYMENT({
        data: {
          attempted: Money.toDollarString(err.attempted),
          outstanding: Money.toDollarString(err.outstanding),
        },
      });
    case 'AlreadyPaid':
      return errors.ALREADY_PAID();
    case 'InvoiceVoided':
      return errors.INVOICE_VOIDED();
    case 'NoLineItems':
      return errors.NO_LINE_ITEMS();
    case 'ConcurrencyConflict':
      return errors.CONCURRENCY_CONFLICT();
    case 'InvalidInput':
      return errors.INVALID_INPUT({ data: { reason: err.reason } });
    case 'NotOverdue':
      return errors.NOT_OVERDUE();
    case 'LateFeeAlreadyApplied':
      return errors.LATE_FEE_ALREADY_APPLIED();
  }
}

/**
 * Maps a domain CreateClientError to the matching oRPC error instance.
 * The caller is responsible for throwing the returned error.
 */
export function mapClientError(
  err: CreateClientError,
  errors: RpcErrors,
): Error {
  switch (err.kind) {
    case 'NameTooShort':
      return errors.NAME_TOO_SHORT();
    case 'NameTooLong':
      return errors.NAME_TOO_LONG();
    case 'InvalidEmail':
      return errors.INVALID_EMAIL({ data: { reason: `Invalid email: ${err.raw}` } });
  }
}
