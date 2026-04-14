import type { Money } from '@/shared/money/money';
import type { InvoiceStatus } from '../value-objects/invoice-status';

export type InvoiceError =
  | { readonly kind: 'InvalidTransition'; readonly from: InvoiceStatus; readonly to: InvoiceStatus }
  | { readonly kind: 'NoLineItems' }
  | { readonly kind: 'AlreadyPaid' }
  | { readonly kind: 'Overpayment'; readonly attempted: Money; readonly outstanding: Money }
  | { readonly kind: 'InvoiceVoided' }
  | { readonly kind: 'ConcurrencyConflict' }
  | { readonly kind: 'InvalidInput'; readonly reason: string }
  | { readonly kind: 'NotOverdue' }
  | { readonly kind: 'LateFeeAlreadyApplied' };

export const InvoiceError = {
  invalidTransition: (from: InvoiceStatus, to: InvoiceStatus): InvoiceError => ({
    kind: 'InvalidTransition',
    from,
    to,
  }),
  noLineItems: (): InvoiceError => ({ kind: 'NoLineItems' }),
  alreadyPaid: (): InvoiceError => ({ kind: 'AlreadyPaid' }),
  overpayment: (attempted: Money, outstanding: Money): InvoiceError => ({
    kind: 'Overpayment',
    attempted,
    outstanding,
  }),
  invoiceVoided: (): InvoiceError => ({ kind: 'InvoiceVoided' }),
  concurrencyConflict: (): InvoiceError => ({ kind: 'ConcurrencyConflict' }),
  invalidInput: (reason: string): InvoiceError => ({ kind: 'InvalidInput', reason }),
  notOverdue: (): InvoiceError => ({ kind: 'NotOverdue' }),
  lateFeeAlreadyApplied: (): InvoiceError => ({ kind: 'LateFeeAlreadyApplied' }),
} as const;
