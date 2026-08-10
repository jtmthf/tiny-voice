import { defineBrandedId } from '@/shared/domain/branded-id';

const InvoiceIdKit = defineBrandedId('inv');

export type InvoiceId = ReturnType<typeof InvoiceIdKit.create>;

export const newInvoiceId = InvoiceIdKit.create;

export const parseInvoiceId = InvoiceIdKit.parse;

export const InvoiceIdSchema = InvoiceIdKit.schema;
