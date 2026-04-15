import { it } from '@fast-check/vitest';
import { describe, expect } from 'vitest';
import fc from 'fast-check';
import { Money } from '@/shared/money/money';
import type { LineItemId } from '@/shared/ids/line-item-id';
import { newPaymentId } from '@/shared/ids/payment-id';
import {
  subtotal,
  total,
  outstandingBalance,
  addLineItem,
  sendInvoice,
  recordPayment,
  voidInvoice,
} from './invoice';
import { lineTotal } from './line-item';
import {
  arbDraftInvoice,
  arbSentInvoice,
  arbLineItem,
} from '../testing/arbitraries';
import { buildPaidInvoice } from '../testing/invoice-factory';

describe('Invoice PBT invariants', () => {
  // 1. subtotal equals sum of line item totals
  it.prop([arbDraftInvoice])('subtotal equals sum of line item totals', (invoice) => {
    const sub = subtotal(invoice);
    let sum = Money.zero();
    for (const item of invoice.lineItems) {
      sum = Money.add(sum, lineTotal(item));
    }
    expect(Money.equals(sub, sum)).toBe(true);
  });

  // 2. outstandingBalance >= 0 for any invoice
  it.prop([arbSentInvoice])('outstanding balance is non-negative for sent invoices', (invoice) => {
    const balance = outstandingBalance(invoice);
    expect(balance.cents).toBeGreaterThanOrEqual(0n);
  });

  it.prop([arbDraftInvoice])('outstanding balance is non-negative for draft invoices', (invoice) => {
    const balance = outstandingBalance(invoice);
    expect(balance.cents).toBeGreaterThanOrEqual(0n);
  });

  // 3. State machine: draft can only transition to sent (with items) or void
  it.prop([arbDraftInvoice])('draft invoice: send succeeds iff has line items', (invoice) => {
    const result = sendInvoice(invoice);
    if (invoice.lineItems.length === 0) {
      expect(result.isErr()).toBe(true);
      if (result.isErr()) expect(result.error.kind).toBe('NoLineItems');
    } else {
      expect(result.isOk()).toBe(true);
      if (result.isOk()) expect(result.value.status).toBe('sent');
    }
  });

  it.prop([arbDraftInvoice, arbLineItem])('adding line item to draft succeeds', (invoice, item) => {
    const result = addLineItem(invoice, item);
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.lineItems.length).toBe(invoice.lineItems.length + 1);
      expect(result.value.status).toBe('draft');
    }
  });

  it.prop([arbSentInvoice, arbLineItem])('adding line item to sent invoice fails', (invoice, item) => {
    const result = addLineItem(invoice, item);
    expect(result.isErr()).toBe(true);
  });

  // 4. Payments summing to total result in paid status
  it.prop([arbSentInvoice])(
    'paying the exact total transitions to paid',
    (invoice) => {
      const invoiceTotal = total(invoice);
      if (invoiceTotal.cents <= 0n) return; // skip zero-total invoices

      // Pay in full with a single payment
      const payment = {
        id: newPaymentId(),
        amount: invoiceTotal,
        recordedAt: new Date(),
      };
      const result = recordPayment(invoice, payment);
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.status).toBe('paid');
      }
    },
  );

  // Also test split payments
  it.prop([
    arbSentInvoice,
    fc.integer({ min: 2, max: 5 }),
  ])('splitting total into N equal payments leads to paid', (invoice, numPayments) => {
    const invoiceTotal = total(invoice);
    if (invoiceTotal.cents <= 0n) return;
    if (invoiceTotal.cents < BigInt(numPayments)) return; // can't split into payments smaller than 1 cent

    // Simple split: first N-1 payments get floor(total/N), last gets remainder
    const perPayment = invoiceTotal.cents / BigInt(numPayments);
    if (perPayment <= 0n) return;

    let current = invoice;
    for (let i = 0; i < numPayments - 1; i++) {
      const payment = {
        id: newPaymentId(),
        amount: Money.fromCents(perPayment),
        recordedAt: new Date(),
      };
      const result = recordPayment(current, payment);
      expect(result.isOk()).toBe(true);
      if (result.isErr()) return;
      current = result.value;
    }

    // Last payment: the remainder
    const remainder = outstandingBalance(current);
    if (remainder.cents <= 0n) {
      expect(current.status).toBe('paid');
      return;
    }

    const lastPayment = {
      id: newPaymentId(),
      amount: remainder,
      recordedAt: new Date(),
    };
    const finalResult = recordPayment(current, lastPayment);
    expect(finalResult.isOk()).toBe(true);
    if (finalResult.isOk()) {
      expect(finalResult.value.status).toBe('paid');
    }
  });

  // 5. Overpayment returns error
  it.prop([arbSentInvoice])('payment exceeding outstanding is rejected as Overpayment', (invoice) => {
    const outstanding = outstandingBalance(invoice);
    const overAmount = Money.fromCents(outstanding.cents + 1n);
    const payment = {
      id: newPaymentId(),
      amount: overAmount,
      recordedAt: new Date(),
    };
    const result = recordPayment(invoice, payment);
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.kind).toBe('Overpayment');
    }
  });

  // 6. Voided invoice rejects all transitions
  describe('voided invoice rejects all transitions', () => {
    it.prop([arbDraftInvoice])('void draft then reject all transitions', (draft) => {
      const voided = voidInvoice(draft);
      expect(voided.isOk()).toBe(true);
      if (voided.isErr()) return;

      const voidedInv = voided.value;

      // Try to add line item
      const addResult = addLineItem(voidedInv, {
        id: newPaymentId() as unknown as LineItemId,
        description: 'x',
        quantity: 1,
        unitPrice: Money.fromCents(100n),
        kind: 'regular',
      });
      expect(addResult.isErr()).toBe(true);
      if (addResult.isErr()) expect(addResult.error.kind).toBe('InvoiceVoided');

      // Try to send
      const sendResult = sendInvoice(voidedInv);
      expect(sendResult.isErr()).toBe(true);
      if (sendResult.isErr()) expect(sendResult.error.kind).toBe('InvoiceVoided');

      // Try to record payment
      const payResult = recordPayment(voidedInv, {
        id: newPaymentId(),
        amount: Money.fromCents(100n),
        recordedAt: new Date(),
      });
      expect(payResult.isErr()).toBe(true);
      if (payResult.isErr()) expect(payResult.error.kind).toBe('InvoiceVoided');

      // Try to void again
      const voidAgain = voidInvoice(voidedInv);
      expect(voidAgain.isErr()).toBe(true);
      if (voidAgain.isErr()) expect(voidAgain.error.kind).toBe('InvoiceVoided');
    });
  });

  // Additional: paid invoice rejects further payments
  it('paid invoice rejects further payments', () => {
    const paid = buildPaidInvoice();
    const payment = {
      id: newPaymentId(),
      amount: Money.fromCents(100n),
      recordedAt: new Date(),
    };
    const result = recordPayment(paid, payment);
    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error.kind).toBe('AlreadyPaid');
  });

  // paid invoice rejects void
  it('paid invoice rejects void', () => {
    const paid = buildPaidInvoice();
    const result = voidInvoice(paid);
    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error.kind).toBe('AlreadyPaid');
  });
});
