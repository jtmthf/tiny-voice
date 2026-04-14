import { z } from 'zod/v4';
import { InvoiceIdSchema } from '@/shared/ids/invoice-id';
import { ClientIdSchema } from '@/shared/ids/client-id';

export const InvoiceSentSchema = z.object({
  invoiceId: InvoiceIdSchema,
  clientId: ClientIdSchema,
  totalCents: z.bigint(),
  sentAt: z.date(),
});

export type InvoiceSent = z.infer<typeof InvoiceSentSchema>;
