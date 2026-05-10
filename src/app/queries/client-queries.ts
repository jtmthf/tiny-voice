import { queryOptions } from '@tanstack/react-query';
import { listClientsFn } from '@/app/fns/list-clients';
import { getClientFn } from '@/app/fns/get-client';
import { getOutstandingByClientFn } from '@/app/fns/get-outstanding-by-client';
import { getClientInvoicesFn } from '@/app/fns/get-client-invoices';

export const clientsQueryOptions = () =>
  queryOptions({ queryKey: ['clients'], queryFn: () => listClientsFn() });

export const clientQueryOptions = (id: string) =>
  queryOptions({ queryKey: ['clients', id], queryFn: () => getClientFn({ data: { id } }) });

export const outstandingByClientQueryOptions = (clientId: string) =>
  queryOptions({
    queryKey: ['invoices', 'outstanding', clientId],
    queryFn: () => getOutstandingByClientFn({ data: { clientId } }),
  });

export const clientInvoicesQueryOptions = (clientId: string) =>
  queryOptions({
    queryKey: ['invoices', 'by-client', clientId],
    queryFn: () => getClientInvoicesFn({ data: { clientId } }),
  });
