import { z } from 'zod/v4';
import { InvoiceIdSchema } from '@/shared/ids/invoice-id';
import { PaymentIdSchema } from '@/shared/ids/payment-id';

export const InvoicePaymentRecordedSchema = z.object({
  invoiceId: InvoiceIdSchema,
  paymentId: PaymentIdSchema,
  amountCents: z.string(),
  becamePaid: z.boolean(),
  recordedAt: z.iso.datetime(),
});

export type InvoicePaymentRecorded = z.infer<typeof InvoicePaymentRecordedSchema>;
