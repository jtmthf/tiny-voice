import { describe, it, expect } from 'vitest';
import type { Result } from 'neverthrow';
import { Money } from '@/shared/money/money';
import { newLineItemId } from '@/shared/ids/line-item-id';
import type { DueDate } from '@/shared/time/due-date';
import { expectOk } from '@/shared/testing/expect-ok';
import type { InvoiceError } from '../errors/invoice-error';
import {
  buildDraftInvoice,
  buildSentInvoice,
  buildPaidInvoice,
  buildVoidInvoice,
  buildLineItem,
  buildPayment,
} from '../testing/invoice-factory';
import type { Invoice, InvoiceOutcome } from './invoice';
import {
  addLineItem,
  sendInvoice,
  recordPayment,
  addLateFee,
  voidInvoice,
  total,
} from './invoice';

const NOW = new Date('2025-01-15T12:00:00Z');
const OVERDUE_TODAY = '2099-01-01' as DueDate;
const NOT_OVERDUE_TODAY = '2025-01-01' as DueDate;

interface TransitionCase {
  readonly start: 'draft' | 'sent' | 'paid' | 'void';
  readonly operation: string;
  readonly expectedKind: InvoiceError['kind'];
  readonly build: () => Invoice;
  readonly run: (invoice: Invoice) => Result<InvoiceOutcome, InvoiceError>;
}

describe('invoice transition guard matrix', () => {
  const cases: readonly TransitionCase[] = [
    {
      start: 'sent',
      operation: 'addLineItem',
      expectedKind: 'InvalidTransition',
      build: () => buildSentInvoice(),
      run: (invoice) => addLineItem(invoice, buildLineItem()),
    },
    {
      start: 'paid',
      operation: 'addLineItem',
      expectedKind: 'AlreadyPaid',
      build: () => buildPaidInvoice(),
      run: (invoice) => addLineItem(invoice, buildLineItem()),
    },
    {
      start: 'void',
      operation: 'addLineItem',
      expectedKind: 'InvoiceVoided',
      build: () => buildVoidInvoice(),
      run: (invoice) => addLineItem(invoice, buildLineItem()),
    },
    {
      start: 'sent',
      operation: 'sendInvoice',
      expectedKind: 'InvalidTransition',
      build: () => buildSentInvoice(),
      run: (invoice) => sendInvoice(invoice, NOW),
    },
    {
      start: 'paid',
      operation: 'sendInvoice',
      expectedKind: 'AlreadyPaid',
      build: () => buildPaidInvoice(),
      run: (invoice) => sendInvoice(invoice, NOW),
    },
    {
      start: 'void',
      operation: 'sendInvoice',
      expectedKind: 'InvoiceVoided',
      build: () => buildVoidInvoice(),
      run: (invoice) => sendInvoice(invoice, NOW),
    },
    {
      start: 'draft',
      operation: 'recordPayment',
      expectedKind: 'InvalidTransition',
      build: () => buildDraftInvoice(),
      run: (invoice) => recordPayment(invoice, buildPayment()),
    },
    {
      start: 'paid',
      operation: 'recordPayment',
      expectedKind: 'AlreadyPaid',
      build: () => buildPaidInvoice(),
      run: (invoice) => recordPayment(invoice, buildPayment()),
    },
    {
      start: 'void',
      operation: 'recordPayment',
      expectedKind: 'InvoiceVoided',
      build: () => buildVoidInvoice(),
      run: (invoice) => recordPayment(invoice, buildPayment()),
    },
    {
      start: 'draft',
      operation: 'addLateFee',
      expectedKind: 'InvalidTransition',
      build: () => buildDraftInvoice(),
      run: (invoice) => addLateFee(invoice, OVERDUE_TODAY, newLineItemId()),
    },
    {
      start: 'paid',
      operation: 'addLateFee',
      expectedKind: 'AlreadyPaid',
      build: () => buildPaidInvoice(),
      run: (invoice) => addLateFee(invoice, OVERDUE_TODAY, newLineItemId()),
    },
    {
      start: 'void',
      operation: 'addLateFee',
      expectedKind: 'InvoiceVoided',
      build: () => buildVoidInvoice(),
      run: (invoice) => addLateFee(invoice, OVERDUE_TODAY, newLineItemId()),
    },
    {
      start: 'paid',
      operation: 'voidInvoice',
      expectedKind: 'AlreadyPaid',
      build: () => buildPaidInvoice(),
      run: (invoice) => voidInvoice(invoice, NOW),
    },
    {
      start: 'void',
      operation: 'voidInvoice',
      expectedKind: 'InvoiceVoided',
      build: () => buildVoidInvoice(),
      run: (invoice) => voidInvoice(invoice, NOW),
    },
  ];

  it.each(cases)('$start -> $operation returns $expectedKind', ({ build, run, expectedKind }) => {
    const invoice = build();
    const result = run(invoice);

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.kind).toBe(expectedKind);
    }
  });
});

describe('invoice transition non-status guards', () => {
  it('sendInvoice on a draft with zero line items returns NoLineItems', () => {
    const draft = buildDraftInvoice();
    const result = sendInvoice(draft, NOW);

    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error.kind).toBe('NoLineItems');
  });

  it('recordPayment for more than the outstanding balance returns Overpayment', () => {
    const sent = buildSentInvoice();
    const overpayment = buildPayment({ amount: Money.fromCents(total(sent).cents + 1n) });
    const result = recordPayment(sent, overpayment);

    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error.kind).toBe('Overpayment');
  });

  it('addLateFee on a sent invoice that is not overdue returns NotOverdue', () => {
    const sent = buildSentInvoice();
    const result = addLateFee(sent, NOT_OVERDUE_TODAY, newLineItemId());

    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error.kind).toBe('NotOverdue');
  });

  it('addLateFee applied twice returns LateFeeAlreadyApplied', () => {
    const sent = buildSentInvoice();
    const withFee = expectOk(addLateFee(sent, OVERDUE_TODAY, newLineItemId())).aggregate;
    const result = addLateFee(withFee, OVERDUE_TODAY, newLineItemId());

    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error.kind).toBe('LateFeeAlreadyApplied');
  });
});

describe('invoice transition allowed paths', () => {
  it('voidInvoice on a draft succeeds and emits InvoiceVoided', () => {
    const draft = buildDraftInvoice();
    const outcome = expectOk(voidInvoice(draft, NOW));

    expect(outcome.aggregate.status).toBe('void');
    expect(outcome.events).toHaveLength(1);
    expect(outcome.events[0]?.type).toBe('InvoiceVoided');
  });

  it('voidInvoice on a sent invoice succeeds and emits InvoiceVoided', () => {
    const sent = buildSentInvoice();
    const outcome = expectOk(voidInvoice(sent, NOW));

    expect(outcome.aggregate.status).toBe('void');
    expect(outcome.events).toHaveLength(1);
    expect(outcome.events[0]?.type).toBe('InvoiceVoided');
  });

  it('recordPayment for exactly the outstanding balance flips status to paid and marks becamePaid', () => {
    const sent = buildSentInvoice();
    const payment = buildPayment({ amount: total(sent) });
    const outcome = expectOk(recordPayment(sent, payment));

    expect(outcome.aggregate.status).toBe('paid');
    expect(outcome.events).toHaveLength(1);
    const event = outcome.events[0];
    expect(event?.type).toBe('InvoicePaymentRecorded');
    if (event?.type === 'InvoicePaymentRecorded') {
      expect(event.payload.becamePaid).toBe(true);
    }
  });
});
