import type { Id } from './id';
import { newId, parseId, prefixedIdSchema } from './id';

export type InvoiceId = Id<'inv'>;

export const newInvoiceId: () => InvoiceId = newId('inv');

export const parseInvoiceId: (value: string) => InvoiceId = (v) => parseId('inv', v);

export const InvoiceIdSchema = prefixedIdSchema('inv');
