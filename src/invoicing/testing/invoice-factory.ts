import { newInvoiceId } from '@/shared/ids/invoice-id';
import { newClientId } from '@/shared/ids/client-id';
import { newLineItemId } from '@/shared/ids/line-item-id';
import { newPaymentId } from '@/shared/ids/payment-id';
import { Money } from '@/shared/money/money';
import type { DueDate } from '@/shared/time/due-date';
import type { TaxRate } from '../value-objects/tax-rate';
import type { Invoice } from '../entities/invoice';
import {
  createInvoice,
  addLineItem,
  sendInvoice,
  recordPayment,
  total,
} from '../entities/invoice';
import type { LineItem } from '../entities/line-item';
import type { Payment } from '../entities/payment';

const DEFAULT_DATE = new Date('2025-01-15T12:00:00Z');
const DEFAULT_DUE_DATE = '2025-02-15' as DueDate;
const DEFAULT_TAX_RATE = 0.1 as TaxRate;

export function buildLineItem(overrides?: Partial<LineItem>): LineItem {
  return {
    id: overrides?.id ?? newLineItemId(),
    description: overrides?.description ?? 'Test item',
    quantity: overrides?.quantity ?? 1,
    unitPrice: overrides?.unitPrice ?? Money.fromCents(10000n),
  };
}

export function buildPayment(overrides?: Partial<Payment>): Payment {
  return {
    id: overrides?.id ?? newPaymentId(),
    amount: overrides?.amount ?? Money.fromCents(5000n),
    recordedAt: overrides?.recordedAt ?? DEFAULT_DATE,
  };
}

export function buildDraftInvoice(overrides?: {
  lineItems?: LineItem[];
  taxRate?: TaxRate;
  dueDate?: DueDate;
}): Invoice {
  const result = createInvoice({
    id: newInvoiceId(),
    clientId: newClientId(),
    taxRate: overrides?.taxRate ?? DEFAULT_TAX_RATE,
    dueDate: overrides?.dueDate ?? DEFAULT_DUE_DATE,
    createdAt: DEFAULT_DATE,
  });
  let invoice = result._unsafeUnwrap();

  for (const item of overrides?.lineItems ?? []) {
    const r = addLineItem(invoice, item);
    invoice = r._unsafeUnwrap();
  }

  return invoice;
}

export function buildSentInvoice(overrides?: {
  lineItems?: LineItem[];
  taxRate?: TaxRate;
  dueDate?: DueDate;
}): Invoice {
  const items = overrides?.lineItems ?? [buildLineItem()];
  const draft = buildDraftInvoice({ ...overrides, lineItems: items });
  return sendInvoice(draft)._unsafeUnwrap();
}

export function buildPaidInvoice(overrides?: {
  lineItems?: LineItem[];
  taxRate?: TaxRate;
  dueDate?: DueDate;
}): Invoice {
  const sent = buildSentInvoice(overrides);
  const fullAmount = total(sent);
  const payment = buildPayment({ amount: fullAmount });
  return recordPayment(sent, payment)._unsafeUnwrap();
}
