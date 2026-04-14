import { z } from 'zod/v4';
import { InvoiceIdSchema } from '@/shared/ids/invoice-id';
import { PaymentIdSchema } from '@/shared/ids/payment-id';

export const InvoicePaymentRecordedSchema = z.object({
  invoiceId: InvoiceIdSchema,
  paymentId: PaymentIdSchema,
  amountCents: z.bigint(),
  becamePaid: z.boolean(),
  recordedAt: z.date(),
});

export type InvoicePaymentRecorded = z.infer<typeof InvoicePaymentRecordedSchema>;
