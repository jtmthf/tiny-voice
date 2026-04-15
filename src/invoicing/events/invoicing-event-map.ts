import type { InvoiceSent } from './invoice-sent';
import type { InvoicePaymentRecorded } from './invoice-payment-recorded';
import type { InvoiceVoided } from './invoice-voided';

export interface InvoicingEventMap {
  InvoiceSent: InvoiceSent;
  InvoicePaymentRecorded: InvoicePaymentRecorded;
  InvoiceVoided: InvoiceVoided;
}
