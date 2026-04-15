import type { ClientId } from '@/shared/ids/client-id';
import { Money } from '@/shared/money/money';
import type { InvoiceStatus } from '../value-objects/invoice-status';
import { calculateTax } from '../value-objects/tax-rate';
import type { InvoiceRepository } from '../ports/invoice-repository';
import type { InvoiceSummary } from './get-invoice-summary';

export interface ListInvoiceSummariesFilters {
  readonly status?: InvoiceStatus;
  readonly clientId?: ClientId;
}

export interface ListInvoiceSummariesDeps {
  readonly repo: InvoiceRepository;
}

export function listInvoiceSummaries(
  deps: ListInvoiceSummariesDeps,
  filters?: ListInvoiceSummariesFilters,
): readonly InvoiceSummary[] {
  const items = deps.repo.listSummaries(filters);

  return items.map((item): InvoiceSummary => {
    const sub = Money.fromCents(item.subtotalCents);
    const tax = calculateTax(sub, item.taxRate);
    const tot = Money.add(sub, tax);
    const paid = Money.fromCents(item.paidAmountCents);
    const outstanding = Money.subtract(tot, paid);

    return {
      id: item.id,
      clientId: item.clientId,
      status: item.status,
      lineItemCount: item.lineItemCount,
      subtotal: sub,
      taxAmount: tax,
      total: tot,
      paidAmount: paid,
      outstandingBalance: outstanding,
      dueDate: item.dueDate,
      createdAt: item.createdAt,
    };
  });
}
