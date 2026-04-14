import type { InvoiceId } from '@/shared/ids/invoice-id';
import type { PaymentId } from '@/shared/ids/payment-id';
import type { Money } from '@/shared/money/money';
import type { InvoiceRepository } from '../ports/invoice-repository';

export interface PaymentSummary {
  readonly id: PaymentId;
  readonly amount: Money;
  readonly recordedAt: Date;
}

export interface GetInvoicePaymentsDeps {
  readonly repo: InvoiceRepository;
}

export function getInvoicePayments(
  deps: GetInvoicePaymentsDeps,
  invoiceId: InvoiceId,
): readonly PaymentSummary[] | null {
  const invoice = deps.repo.findById(invoiceId);
  if (!invoice) return null;

  return invoice.payments.map((p) => ({
    id: p.id,
    amount: p.amount,
    recordedAt: p.recordedAt,
  }));
}
