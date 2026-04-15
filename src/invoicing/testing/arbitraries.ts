import fc from 'fast-check';
import { newInvoiceId } from '@/shared/ids/invoice-id';
import { newClientId } from '@/shared/ids/client-id';
import { newLineItemId } from '@/shared/ids/line-item-id';
import { newPaymentId } from '@/shared/ids/payment-id';
import { Money } from '@/shared/money/money';
import type { DueDate } from '@/shared/time/due-date';
import type { TaxRate } from '../value-objects/tax-rate';
import type { Invoice } from '../entities/invoice';
import type { LineItem } from '../entities/line-item';
import type { Payment } from '../entities/payment';
import type { InvoiceStatus } from '../value-objects/invoice-status';

export const arbMoney = fc
  .bigInt({ min: 1n, max: 1_000_000_00n }) // 1 cent to $1M
  .map((cents) => Money.fromCents(cents));

export const arbTaxRate = fc
  .integer({ min: 0, max: 1000 })
  .map((n) => (n / 1000) as TaxRate);

export const arbDueDate = fc
  .date({ min: new Date('2020-01-01'), max: new Date('2030-12-31') })
  .map((d) => {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}` as DueDate;
  });

export const arbLineItem: fc.Arbitrary<LineItem> = fc.record({
  id: fc.constant(null).map(() => newLineItemId()),
  description: fc.string({ minLength: 1, maxLength: 50 }),
  quantity: fc.integer({ min: 1, max: 1000 }),
  unitPrice: arbMoney,
  kind: fc.constant('regular' as const),
});

export const arbPayment: fc.Arbitrary<Payment> = fc.record({
  id: fc.constant(null).map(() => newPaymentId()),
  amount: arbMoney,
  recordedAt: fc.date({ min: new Date('2020-01-01'), max: new Date('2030-12-31') }),
});

export const arbInvoiceStatus: fc.Arbitrary<InvoiceStatus> = fc.constantFrom(
  'draft' as const,
  'sent' as const,
  'paid' as const,
  'void' as const,
);

/**
 * Arbitrary for a draft invoice with 0 to 5 line items.
 */
export const arbDraftInvoice: fc.Arbitrary<Invoice> = fc
  .record({
    lineItems: fc.array(arbLineItem, { minLength: 0, maxLength: 5 }),
    taxRate: arbTaxRate,
    dueDate: arbDueDate,
    createdAt: fc.date({ min: new Date('2020-01-01'), max: new Date('2030-12-31') }),
  })
  .map(({ lineItems, taxRate, dueDate, createdAt }) => ({
    id: newInvoiceId(),
    clientId: newClientId(),
    status: 'draft' as const,
    lineItems,
    payments: [],
    taxRate,
    dueDate,
    createdAt,
    version: 1 + lineItems.length, // version increments per line item added
  }));

/**
 * Arbitrary for a sent invoice (has at least 1 line item).
 */
export const arbSentInvoice: fc.Arbitrary<Invoice> = fc
  .record({
    lineItems: fc.array(arbLineItem, { minLength: 1, maxLength: 5 }),
    taxRate: arbTaxRate,
    dueDate: arbDueDate,
    createdAt: fc.date({ min: new Date('2020-01-01'), max: new Date('2030-12-31') }),
  })
  .map(({ lineItems, taxRate, dueDate, createdAt }) => ({
    id: newInvoiceId(),
    clientId: newClientId(),
    status: 'sent' as const,
    lineItems,
    payments: [],
    taxRate,
    dueDate,
    createdAt,
    version: 2 + lineItems.length,
  }));
