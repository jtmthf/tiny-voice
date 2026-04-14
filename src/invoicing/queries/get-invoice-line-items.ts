import type { InvoiceId } from '@/shared/ids/invoice-id';
import type { LineItemId } from '@/shared/ids/line-item-id';
import type { Money } from '@/shared/money/money';
import type { InvoiceRepository } from '../ports/invoice-repository';

export interface LineItemSummary {
  readonly id: LineItemId;
  readonly description: string;
  readonly quantity: number;
  readonly unitPrice: Money;
}

export interface GetInvoiceLineItemsDeps {
  readonly repo: InvoiceRepository;
}

export function getInvoiceLineItems(
  deps: GetInvoiceLineItemsDeps,
  invoiceId: InvoiceId,
): readonly LineItemSummary[] | null {
  const invoice = deps.repo.findById(invoiceId);
  if (!invoice) return null;

  return invoice.lineItems.map((li) => ({
    id: li.id,
    description: li.description,
    quantity: li.quantity,
    unitPrice: li.unitPrice,
  }));
}
