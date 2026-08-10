import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod/v4';
import { getAppReadView } from '@/app/instance';
import { invoiceSummaryToDto } from './dto';
import type { InvoiceStatus } from '@/invoicing/value-objects/invoice-status';

const Input = z.object({ status: z.string().optional() });

export const listInvoicesFn = createServerFn({ method: 'GET' })
  .validator((data: unknown) => Input.parse(data ?? {}))
  .handler(({ data }) => {
    const app = getAppReadView();
    const filters = data.status ? { status: data.status as InvoiceStatus } : undefined;
    return app.queries.invoicing.listInvoices(filters).map(invoiceSummaryToDto);
  });
