import fc from 'fast-check';
import { Money } from '@/shared/money/money';
import { newPaymentId } from '@/shared/ids/payment-id';
import { expectOk } from '@/shared/testing/expect-ok';
import type { Invoice } from '../entities/invoice';
import { outstandingBalance, recordPayment } from '../entities/invoice';
import type { LineItem, LineItemKind } from '../entities/line-item';
import type { InvoiceStatus } from '../value-objects/invoice-status';
import type { TaxRate } from '../value-objects/tax-rate';
import {
  buildDraftInvoice,
  buildLineItem,
  buildPaidInvoice,
  buildSentInvoice,
  buildVoidInvoice,
} from './invoice-factory';

const PAYMENT_RECORDED_AT = new Date('2025-01-15T12:00:00Z');

const rawLineItemArb = fc.record({
  description: fc.string({ minLength: 1, maxLength: 30 }).filter((s) => !s.includes(' ')),
  quantity: fc.integer({ min: 1, max: 20 }),
  unitPrice: fc.bigInt({ min: 1n, max: 1_000_000n }).map(Money.fromCents),
  kind: fc.constantFrom<LineItemKind>('regular', 'lateFee'),
});

/** 1-5 line items, with at most one `lateFee` kind per invoice. */
const lineItemsArb: fc.Arbitrary<LineItem[]> = fc
  .array(rawLineItemArb, { minLength: 1, maxLength: 5 })
  .map((items) => {
    let lateFeeUsed = false;
    return items.map((item) => {
      const kind: LineItemKind = item.kind === 'lateFee' && !lateFeeUsed ? 'lateFee' : 'regular';
      if (kind === 'lateFee') lateFeeUsed = true;
      return buildLineItem({ ...item, kind });
    });
  });

const taxRateArb: fc.Arbitrary<TaxRate> = fc
  .constantFrom(0, 0.05, 0.075, 0.1)
  .map((n) => n as TaxRate);

const statusArb: fc.Arbitrary<InvoiceStatus> = fc.constantFrom('draft', 'sent', 'paid', 'void');

/** Percentage (1-99) of the current outstanding balance to pay in a partial payment. */
const paymentFractionArb = fc.integer({ min: 1, max: 99 });

function applyPartialPayments(invoice: Invoice, fractions: readonly number[]): Invoice {
  let current = invoice;
  for (const fraction of fractions) {
    const outstanding = outstandingBalance(current);
    if (outstanding.cents <= 0n) break;
    const amountCents = (outstanding.cents * BigInt(fraction)) / 100n;
    if (amountCents <= 0n) continue;
    const payment = {
      id: newPaymentId(),
      amount: Money.fromCents(amountCents),
      recordedAt: PAYMENT_RECORDED_AT,
    };
    current = expectOk(recordPayment(current, payment)).aggregate;
  }
  return current;
}

function realizeInvoice(input: {
  lineItems: LineItem[];
  taxRate: TaxRate;
  status: InvoiceStatus;
  paymentFractions: readonly number[];
}): Invoice {
  switch (input.status) {
    case 'draft':
      return buildDraftInvoice({ lineItems: input.lineItems, taxRate: input.taxRate });
    case 'void':
      return buildVoidInvoice({ lineItems: input.lineItems, taxRate: input.taxRate });
    case 'paid':
      return buildPaidInvoice({ lineItems: input.lineItems, taxRate: input.taxRate });
    case 'sent':
      return applyPartialPayments(
        buildSentInvoice({ lineItems: input.lineItems, taxRate: input.taxRate }),
        input.paymentFractions,
      );
  }
}

/**
 * Deterministic-per-seed arbitrary for a domain-legal invoice in any status,
 * built via the invoice-factory builders so payments/state transitions are
 * always legal. 0-2 partial payments are applied to `sent` invoices.
 */
export const invoiceArbitrary: fc.Arbitrary<Invoice> = fc
  .record({
    lineItems: lineItemsArb,
    taxRate: taxRateArb,
    status: statusArb,
    paymentFractions: fc.array(paymentFractionArb, { minLength: 0, maxLength: 2 }),
  })
  .map(realizeInvoice);
