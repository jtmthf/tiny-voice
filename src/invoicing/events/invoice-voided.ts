import { z } from 'zod';
import { InvoiceIdSchema } from '@/shared/ids/invoice-id';

export const InvoiceVoidedSchema = z.object({
  invoiceId: InvoiceIdSchema,
  voidedAt: z.iso.datetime(),
});

export type InvoiceVoided = z.infer<typeof InvoiceVoidedSchema>;
