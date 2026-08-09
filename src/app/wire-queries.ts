import { getClient } from '@/clients/queries/get-client';
import { listClients } from '@/clients/queries/list-clients';
import { getInvoiceSummary } from '@/invoicing/queries/get-invoice-summary';
import { getInvoiceLineItems } from '@/invoicing/queries/get-invoice-line-items';
import { getInvoicePayments } from '@/invoicing/queries/get-invoice-payments';
import { listInvoiceSummaries } from '@/invoicing/queries/list-invoice-summaries';
import { getOutstandingByClient } from '@/invoicing/queries/get-outstanding-by-client';
import { getRevenueByMonth } from '@/reporting/queries/get-revenue-by-month';
import { getRevenueByYear } from '@/reporting/queries/get-revenue-by-year';
import type { ClientRepository } from '@/clients/ports/client-repository';
import type { InvoiceRepository } from '@/invoicing/ports/invoice-repository';
import type { RevenueReadModel } from '@/reporting/ports/revenue-read-model';
import type { AppDeps } from './app-deps';

export interface WireQueriesDeps {
  readonly clientRepo: ClientRepository;
  readonly invoiceRepo: InvoiceRepository;
  readonly revenueReadModel: RevenueReadModel;
}

export function wireQueries(deps: WireQueriesDeps): AppDeps['queries'] {
  return {
    clients: {
      getClient: (id) => getClient({ repo: deps.clientRepo }, id),
      listClients: () => listClients({ repo: deps.clientRepo }),
    },
    invoicing: {
      getInvoiceSummary: (id) => getInvoiceSummary({ repo: deps.invoiceRepo }, id),
      getInvoiceLineItems: (id) => getInvoiceLineItems({ repo: deps.invoiceRepo }, id),
      getInvoicePayments: (id) => getInvoicePayments({ repo: deps.invoiceRepo }, id),
      listInvoices: (filters) => listInvoiceSummaries({ repo: deps.invoiceRepo }, filters),
      getOutstandingByClient: (clientId) =>
        getOutstandingByClient({ repo: deps.invoiceRepo }, clientId),
    },
    reporting: {
      getRevenueByMonth: (month) => getRevenueByMonth({ readModel: deps.revenueReadModel }, month),
      getRevenueByYear: (year) => getRevenueByYear({ readModel: deps.revenueReadModel }, year),
      listAllRevenue: () => deps.revenueReadModel.listAll(),
    },
  };
}
