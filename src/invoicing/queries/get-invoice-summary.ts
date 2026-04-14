import type { InvoiceId } from '@/shared/ids/invoice-id';
import type { ClientId } from '@/shared/ids/client-id';
import type { Money } from '@/shared/money/money';
import type { DueDate } from '@/shared/time/due-date';
import type { InvoiceStatus } from '../value-objects/invoice-status';
import { subtotal, taxAmount, total, paidAmount, outstandingBalance } from '../entities/invoice';
import type { InvoiceRepository } from '../ports/invoice-repository';

export interface InvoiceSummary {
  readonly id: InvoiceId;
  readonly clientId: ClientId;
  readonly status: InvoiceStatus;
  readonly lineItemCount: number;
  readonly subtotal: Money;
  readonly taxAmount: Money;
  readonly total: Money;
  readonly paidAmount: Money;
  readonly outstandingBalance: Money;
  readonly dueDate: DueDate;
  readonly createdAt: Date;
}

export interface GetInvoiceSummaryDeps {
  readonly repo: InvoiceRepository;
}

export function getInvoiceSummary(
  deps: GetInvoiceSummaryDeps,
  invoiceId: InvoiceId,
): InvoiceSummary | null {
  const invoice = deps.repo.findById(invoiceId);
  if (!invoice) return null;

  return {
    id: invoice.id,
    clientId: invoice.clientId,
    status: invoice.status,
    lineItemCount: invoice.lineItems.length,
    subtotal: subtotal(invoice),
    taxAmount: taxAmount(invoice),
    total: total(invoice),
    paidAmount: paidAmount(invoice),
    outstandingBalance: outstandingBalance(invoice),
    dueDate: invoice.dueDate,
    createdAt: invoice.createdAt,
  };
}
