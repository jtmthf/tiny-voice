import type { InvoiceId } from '@/shared/ids/invoice-id';
import type { ClientId } from '@/shared/ids/client-id';
import type { Money as MoneyType } from '@/shared/money/money';
import { Money } from '@/shared/money/money';
import type { DueDate } from '@/shared/time/due-date';
import { isOverdue as isDueDateOverdue } from '@/shared/time/due-date';
import type { Result } from 'neverthrow';
import { ok, err } from 'neverthrow';
import type { InvoiceStatus } from '../value-objects/invoice-status';
import type { TaxRate } from '../value-objects/tax-rate';
import { calculateTax } from '../value-objects/tax-rate';
import type { InvoiceError } from '../errors/invoice-error';
import { InvoiceError as IE } from '../errors/invoice-error';
import type { LineItem } from './line-item';
import { lineTotal } from './line-item';
import type { Payment } from './payment';


// ---------------------------------------------------------------------------
// Aggregate root
// ---------------------------------------------------------------------------

export interface Invoice {
  readonly id: InvoiceId;
  readonly clientId: ClientId;
  readonly status: InvoiceStatus;
  readonly lineItems: readonly LineItem[];
  readonly payments: readonly Payment[];
  readonly taxRate: TaxRate;
  readonly dueDate: DueDate;
  readonly createdAt: Date;
  readonly version: number;
}

// ---------------------------------------------------------------------------
// Derived pure functions
// ---------------------------------------------------------------------------

export function subtotal(invoice: Invoice): MoneyType {
  let sum = Money.zero();
  for (const item of invoice.lineItems) {
    sum = Money.add(sum, lineTotal(item));
  }
  return sum;
}

export function taxAmount(invoice: Invoice): MoneyType {
  return calculateTax(subtotal(invoice), invoice.taxRate);
}

export function total(invoice: Invoice): MoneyType {
  return Money.add(subtotal(invoice), taxAmount(invoice));
}

export function paidAmount(invoice: Invoice): MoneyType {
  let sum = Money.zero();
  for (const p of invoice.payments) {
    sum = Money.add(sum, p.amount);
  }
  return sum;
}

export function outstandingBalance(invoice: Invoice): MoneyType {
  return Money.subtract(total(invoice), paidAmount(invoice));
}

export function isOverdue(invoice: Invoice, today: DueDate): boolean {
  return invoice.status === 'sent' && isDueDateOverdue(invoice.dueDate, today);
}

// ---------------------------------------------------------------------------
// State machine transitions (pure — return new Invoice or error)
// ---------------------------------------------------------------------------

export interface CreateInvoiceInput {
  readonly id: InvoiceId;
  readonly clientId: ClientId;
  readonly taxRate: TaxRate;
  readonly dueDate: DueDate;
  readonly createdAt: Date;
}

export function createInvoice(input: CreateInvoiceInput): Invoice {
  return {
    id: input.id,
    clientId: input.clientId,
    status: 'draft',
    lineItems: [],
    payments: [],
    taxRate: input.taxRate,
    dueDate: input.dueDate,
    createdAt: input.createdAt,
    version: 1,
  };
}

export function addLineItem(invoice: Invoice, item: LineItem): Result<Invoice, InvoiceError> {
  if (invoice.status === 'void') return err(IE.invoiceVoided());
  if (invoice.status !== 'draft') {
    return err(IE.invalidTransition(invoice.status, 'draft'));
  }
  return ok({
    ...invoice,
    lineItems: [...invoice.lineItems, item],
    version: invoice.version + 1,
  });
}

export function sendInvoice(invoice: Invoice): Result<Invoice, InvoiceError> {
  if (invoice.status === 'void') return err(IE.invoiceVoided());
  if (invoice.status === 'paid') return err(IE.alreadyPaid());
  if (invoice.status !== 'draft') {
    return err(IE.invalidTransition(invoice.status, 'sent'));
  }
  if (invoice.lineItems.length === 0) {
    return err(IE.noLineItems());
  }
  return ok({
    ...invoice,
    status: 'sent' as const,
    version: invoice.version + 1,
  });
}

export function recordPayment(invoice: Invoice, payment: Payment): Result<Invoice, InvoiceError> {
  if (invoice.status === 'void') return err(IE.invoiceVoided());
  if (invoice.status === 'paid') return err(IE.alreadyPaid());
  if (invoice.status !== 'sent') {
    return err(IE.invalidTransition(invoice.status, 'sent'));
  }

  const outstanding = outstandingBalance(invoice);
  const remaining = Money.subtract(outstanding, payment.amount);
  if (remaining.cents < 0n) {
    return err(IE.overpayment(payment.amount, outstanding));
  }

  const newPayments = [...invoice.payments, payment];
  const updatedInvoice: Invoice = {
    ...invoice,
    payments: newPayments,
    version: invoice.version + 1,
  };

  // Check if fully paid
  const newOutstanding = outstandingBalance(updatedInvoice);
  if (Money.equals(newOutstanding, Money.zero())) {
    return ok({ ...updatedInvoice, status: 'paid' as const });
  }

  return ok(updatedInvoice);
}

export function addLateFee(invoice: Invoice, item: LineItem): Result<Invoice, InvoiceError> {
  if (invoice.status === 'void') return err(IE.invoiceVoided());
  if (invoice.status === 'paid') return err(IE.alreadyPaid());
  if (invoice.status !== 'sent') {
    return err(IE.invalidTransition(invoice.status, 'sent'));
  }
  // Check if a late fee has already been applied
  if (invoice.lineItems.some((li) => li.kind === 'lateFee')) {
    return err(IE.lateFeeAlreadyApplied());
  }
  return ok({
    ...invoice,
    lineItems: [...invoice.lineItems, item],
    version: invoice.version + 1,
  });
}

export function voidInvoice(invoice: Invoice): Result<Invoice, InvoiceError> {
  if (invoice.status === 'void') return err(IE.invoiceVoided());
  if (invoice.status === 'paid') return err(IE.alreadyPaid());
  return ok({
    ...invoice,
    status: 'void' as const,
    version: invoice.version + 1,
  });
}
