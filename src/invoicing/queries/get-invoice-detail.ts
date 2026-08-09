import type { InvoiceId } from '@/shared/ids/invoice-id';
import { subtotal, taxAmount, total, paidAmount, outstandingBalance } from '../entities/invoice';
import type { InvoiceRepository } from '../ports/invoice-repository';
import type { InvoiceSummary } from './get-invoice-summary';
import type { LineItemSummary } from './get-invoice-line-items';
import type { PaymentSummary } from './get-invoice-payments';

export interface InvoiceDetail {
  readonly summary: InvoiceSummary;
  readonly lineItems: readonly LineItemSummary[];
  readonly payments: readonly PaymentSummary[];
}

export interface GetInvoiceDetailDeps {
  readonly repo: InvoiceRepository;
}

export function getInvoiceDetail(
  deps: GetInvoiceDetailDeps,
  invoiceId: InvoiceId,
): InvoiceDetail | null {
  const invoice = deps.repo.findById(invoiceId);
  if (!invoice) return null;

  return {
    summary: {
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
    },
    lineItems: invoice.lineItems.map((li) => ({
      id: li.id,
      description: li.description,
      quantity: li.quantity,
      unitPrice: li.unitPrice,
    })),
    payments: invoice.payments.map((p) => ({
      id: p.id,
      amount: p.amount,
      recordedAt: p.recordedAt,
    })),
  };
}
