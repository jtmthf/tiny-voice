import type { InvoiceSent } from './invoice-sent';
import type { InvoicePaymentRecorded } from './invoice-payment-recorded';
import type { InvoiceVoided } from './invoice-voided';

// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
export type InvoicingEventMap = {
  InvoiceSent: InvoiceSent;
  InvoicePaymentRecorded: InvoicePaymentRecorded;
  InvoiceVoided: InvoiceVoided;
};
