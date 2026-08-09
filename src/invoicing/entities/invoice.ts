import { differenceInCalendarDays, parseISO } from 'date-fns';
import type { InvoiceId } from '@/shared/ids/invoice-id';
import type { ClientId } from '@/shared/ids/client-id';
import type { LineItemId } from '@/shared/ids/line-item-id';
import type { Money as MoneyType } from '@/shared/money/money';
import { Money } from '@/shared/money/money';
import { bankersRound } from '@/shared/money/bankers-round';
import type { Outcome } from '@/shared/outcome/outcome';
import type { DueDate } from '@/shared/time/due-date';
import { isOverdue as isDueDateOverdue } from '@/shared/time/due-date';
import type { Result } from 'neverthrow';
import { ok, err } from 'neverthrow';
import type { InvoiceStatus } from '../value-objects/invoice-status';
import { LateFeeRate } from '../value-objects/late-fee-rate';
import type { TaxRate } from '../value-objects/tax-rate';
import { calculateTax } from '../value-objects/tax-rate';
import type { InvoiceError } from '../errors/invoice-error';
import { InvoiceError as IE } from '../errors/invoice-error';
import type { InvoiceDomainEvent } from '../events/invoice-domain-event';
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

export type InvoiceOutcome = Outcome<Invoice, InvoiceDomainEvent>;

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

export function daysOverdue(dueDate: DueDate, today: DueDate): number {
  return differenceInCalendarDays(parseISO(today), parseISO(dueDate));
}

export function calculateLateFeeLineItem(
  outstanding: MoneyType,
  days: number,
  lineItemId: LineItemId,
): LineItem {
  const SCALE = 1_000_000n;
  const scaledRate = BigInt(Math.round(LateFeeRate * 1_000_000));
  const rawCents = outstanding.cents * scaledRate * BigInt(days);
  const feeCents = bankersRound(rawCents, SCALE);

  return {
    id: lineItemId,
    description: `Late fee (${days} days overdue)`,
    quantity: 1,
    unitPrice: Money.fromCents(feeCents),
    kind: 'lateFee',
  };
}

// ---------------------------------------------------------------------------
// State machine transitions
//
// Each transition is a pure function. Transitions that change state return
// an InvoiceOutcome — the new aggregate paired with the domain events it
// emitted. The aggregate factory `createInvoice` is special: it constructs
// a fresh draft and emits no event.
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

export function addLineItem(
  invoice: Invoice,
  item: LineItem,
): Result<InvoiceOutcome, InvoiceError> {
  if (invoice.status === 'void') return err(IE.invoiceVoided());
  if (invoice.status === 'paid') return err(IE.alreadyPaid());
  if (invoice.status !== 'draft') {
    return err(IE.invalidTransition(invoice.status, 'draft'));
  }
  return ok({
    aggregate: {
      ...invoice,
      lineItems: [...invoice.lineItems, item],
      version: invoice.version + 1,
    },
    events: [],
  });
}

export function sendInvoice(
  invoice: Invoice,
  now: Date,
): Result<InvoiceOutcome, InvoiceError> {
  if (invoice.status === 'void') return err(IE.invoiceVoided());
  if (invoice.status === 'paid') return err(IE.alreadyPaid());
  if (invoice.status !== 'draft') {
    return err(IE.invalidTransition(invoice.status, 'sent'));
  }
  if (invoice.lineItems.length === 0) {
    return err(IE.noLineItems());
  }
  const updated: Invoice = {
    ...invoice,
    status: 'sent',
    version: invoice.version + 1,
  };
  return ok({
    aggregate: updated,
    events: [
      {
        type: 'InvoiceSent',
        payload: {
          invoiceId: updated.id,
          clientId: updated.clientId,
          totalCents: total(updated).cents.toString(),
          sentAt: now.toISOString(),
        },
      },
    ],
  });
}

export function recordPayment(
  invoice: Invoice,
  payment: Payment,
): Result<InvoiceOutcome, InvoiceError> {
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

  const withPayment: Invoice = {
    ...invoice,
    payments: [...invoice.payments, payment],
    version: invoice.version + 1,
  };
  const becamePaid = Money.equals(outstandingBalance(withPayment), Money.zero());
  const updated: Invoice = becamePaid ? { ...withPayment, status: 'paid' } : withPayment;

  return ok({
    aggregate: updated,
    events: [
      {
        type: 'InvoicePaymentRecorded',
        payload: {
          invoiceId: updated.id,
          paymentId: payment.id,
          amountCents: payment.amount.cents.toString(),
          becamePaid,
          recordedAt: payment.recordedAt.toISOString(),
        },
      },
    ],
  });
}

export function addLateFee(
  invoice: Invoice,
  today: DueDate,
  lineItemId: LineItemId,
): Result<InvoiceOutcome, InvoiceError> {
  if (invoice.status === 'void') return err(IE.invoiceVoided());
  if (invoice.status === 'paid') return err(IE.alreadyPaid());
  if (invoice.status !== 'sent') {
    return err(IE.invalidTransition(invoice.status, 'sent'));
  }
  if (invoice.lineItems.some((li) => li.kind === 'lateFee')) {
    return err(IE.lateFeeAlreadyApplied());
  }
  if (!isDueDateOverdue(invoice.dueDate, today)) {
    return err(IE.notOverdue());
  }

  const days = daysOverdue(invoice.dueDate, today);
  const item = calculateLateFeeLineItem(outstandingBalance(invoice), days, lineItemId);

  return ok({
    aggregate: {
      ...invoice,
      lineItems: [...invoice.lineItems, item],
      version: invoice.version + 1,
    },
    events: [],
  });
}

export function voidInvoice(
  invoice: Invoice,
  now: Date,
): Result<InvoiceOutcome, InvoiceError> {
  if (invoice.status === 'void') return err(IE.invoiceVoided());
  if (invoice.status === 'paid') return err(IE.alreadyPaid());
  const updated: Invoice = {
    ...invoice,
    status: 'void',
    version: invoice.version + 1,
  };
  return ok({
    aggregate: updated,
    events: [
      {
        type: 'InvoiceVoided',
        payload: {
          invoiceId: updated.id,
          voidedAt: now.toISOString(),
        },
      },
    ],
  });
}
