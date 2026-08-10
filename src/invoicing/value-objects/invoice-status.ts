import { z } from 'zod';

export const InvoiceStatusSchema = z.enum(['draft', 'sent', 'paid', 'void']);

export type InvoiceStatus = z.infer<typeof InvoiceStatusSchema>;
