import { Money } from '@/shared/money/money';
import type { InvoiceError } from '@/invoicing/errors/invoice-error';
import type { CreateClientError } from '@/clients/commands/create-client';

export function invoiceErrorMessage(err: InvoiceError): string {
  switch (err.kind) {
    case 'InvalidTransition':
      return `Cannot transition from ${err.from} to ${err.to}`;
    case 'NoLineItems':
      return 'Invoice has no line items';
    case 'AlreadyPaid':
      return 'Invoice is already fully paid';
    case 'Overpayment':
      return `Payment of ${Money.toDollarString(err.attempted)} exceeds outstanding balance of ${Money.toDollarString(err.outstanding)}`;
    case 'InvoiceVoided':
      return 'Invoice has been voided';
    case 'ConcurrencyConflict':
      return 'Concurrent edit detected — please refresh and retry';
    case 'InvalidInput':
      return err.reason;
    case 'NotOverdue':
      return 'Invoice is not yet overdue';
    case 'LateFeeAlreadyApplied':
      return 'Late fee has already been applied';
    case 'NotFound':
      return 'Invoice not found';
  }
}

export function clientErrorMessage(err: CreateClientError): string {
  switch (err.kind) {
    case 'NameTooShort':
      return 'Client name is too short';
    case 'NameTooLong':
      return 'Client name is too long';
    case 'InvalidEmail':
      return `Invalid email: ${err.raw}`;
  }
}
