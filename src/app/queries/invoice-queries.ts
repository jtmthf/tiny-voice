import { queryOptions } from '@tanstack/react-query';
import { listInvoicesFn } from '@/app/fns/list-invoices';
import { getInvoiceDetailFn } from '@/app/fns/get-invoice-detail';

export const invoicesQueryOptions = (status?: string) =>
  queryOptions({
    queryKey: status ? ['invoices', { status }] : ['invoices'],
    queryFn: () => listInvoicesFn({ data: { status } }),
  });

export const invoiceDetailQueryOptions = (invoiceId: string) =>
  queryOptions({
    queryKey: ['invoices', invoiceId],
    queryFn: () => getInvoiceDetailFn({ data: { invoiceId } }),
  });
