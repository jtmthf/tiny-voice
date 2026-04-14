import type { ClientId } from '@/shared/ids/client-id';
import type { InvoiceStatus } from '../value-objects/invoice-status';
import type { Invoice } from '../entities/invoice';
import type { InvoiceRepository } from '../ports/invoice-repository';

export interface ListInvoicesFilters {
  readonly status?: InvoiceStatus;
  readonly clientId?: ClientId;
}

export interface ListInvoicesDeps {
  readonly repo: InvoiceRepository;
}

export function listInvoices(
  deps: ListInvoicesDeps,
  filters?: ListInvoicesFilters,
): readonly Invoice[] {
  return deps.repo.list(filters);
}
