import type { InvoiceSent } from './invoice-sent';
import type { InvoicePaymentRecorded } from './invoice-payment-recorded';
import type { InvoiceVoided } from './invoice-voided';

export type InvoiceDomainEvent =
  | { readonly type: 'InvoiceSent'; readonly payload: InvoiceSent }
  | { readonly type: 'InvoicePaymentRecorded'; readonly payload: InvoicePaymentRecorded }
  | { readonly type: 'InvoiceVoided'; readonly payload: InvoiceVoided };
