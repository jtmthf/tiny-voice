import { z } from 'zod';
import { InvoiceIdSchema } from '@/shared/ids/invoice-id';
import { ClientIdSchema } from '@/shared/ids/client-id';

export const InvoiceSentSchema = z.object({
  invoiceId: InvoiceIdSchema,
  clientId: ClientIdSchema,
  totalCents: z.string(),
  sentAt: z.iso.datetime(),
});

export type InvoiceSent = z.infer<typeof InvoiceSentSchema>;
