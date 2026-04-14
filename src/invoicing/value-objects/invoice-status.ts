import { z } from 'zod/v4';

export const InvoiceStatusSchema = z.enum(['draft', 'sent', 'paid', 'void']);

export type InvoiceStatus = z.infer<typeof InvoiceStatusSchema>;
