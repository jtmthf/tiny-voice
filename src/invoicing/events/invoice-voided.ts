import { z } from 'zod/v4';
import { InvoiceIdSchema } from '@/shared/ids/invoice-id';

export const InvoiceVoidedSchema = z.object({
  invoiceId: InvoiceIdSchema,
  voidedAt: z.date(),
});

export type InvoiceVoided = z.infer<typeof InvoiceVoidedSchema>;
