import { describe, it, expect } from 'vitest';
import { newInvoiceId } from '@/shared/ids/invoice-id';
import { newPaymentId } from '@/shared/ids/payment-id';
import { FixedClock } from '@/shared/time/fixed-clock';
import { InProcessEventBus } from '@/shared/events/in-process-event-bus';
import { InMemoryOutbox } from '@/shared/events/in-memory-outbox';
import type { Database } from '@/shared/db/database';
import type { InvoicingEventMap } from '../events/invoicing-event-map';
import { InMemoryInvoiceRepo } from '../adapters/in-memory-invoice-repo';
import { buildSentInvoice, buildPaidInvoice } from '../testing/invoice-factory';
import { total } from '../entities/invoice';
import { recordPayment } from './record-payment';

const STUB_DB: Database = {
  prepare() { throw new Error('Stub DB'); },
  exec() { throw new Error('Stub DB'); },
  transaction<T>(fn: () => T): T { return fn(); },
  close() { /* noop */ },
};

describe('recordPayment command', () => {
  it('records a partial payment and emits event', async () => {
    const repo = new InMemoryInvoiceRepo();
    const clock = new FixedClock(new Date('2025-02-01T10:00:00Z'));
    const eventBus = new InProcessEventBus<InvoicingEventMap>();
    const outbox = new InMemoryOutbox();
    const events: InvoicingEventMap['InvoicePaymentRecorded'][] = [];
    eventBus.subscribe('InvoicePaymentRecorded', (e) => { events.push(e); });

    const invoice = buildSentInvoice();
    repo.save(invoice);

    const result = await recordPayment(
      { db: STUB_DB, repo, outbox, clock, eventBus },
      {
        invoiceId: invoice.id,
        paymentId: newPaymentId(),
        amountCents: 1000n,
      },
    );

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.status).toBe('sent');
      expect(result.value.payments).toHaveLength(1);
    }
    expect(events).toHaveLength(1);
    expect(events[0]!.becamePaid).toBe(false);
  });

  it('transitions to paid when fully paid', async () => {
    const repo = new InMemoryInvoiceRepo();
    const clock = new FixedClock(new Date('2025-02-01T10:00:00Z'));
    const eventBus = new InProcessEventBus<InvoicingEventMap>();
    const outbox = new InMemoryOutbox();
    const events: InvoicingEventMap['InvoicePaymentRecorded'][] = [];
    eventBus.subscribe('InvoicePaymentRecorded', (e) => { events.push(e); });

    const invoice = buildSentInvoice();
    repo.save(invoice);
    const fullAmount = total(invoice).cents;

    const result = await recordPayment(
      { db: STUB_DB, repo, outbox, clock, eventBus },
      {
        invoiceId: invoice.id,
        paymentId: newPaymentId(),
        amountCents: fullAmount,
      },
    );

    expect(result.isOk()).toBe(true);
    if (result.isOk()) expect(result.value.status).toBe('paid');
    expect(events[0]!.becamePaid).toBe(true);
  });

  it('returns error for non-existent invoice', async () => {
    const repo = new InMemoryInvoiceRepo();
    const clock = new FixedClock(new Date('2025-02-01T10:00:00Z'));
    const eventBus = new InProcessEventBus<InvoicingEventMap>();
    const outbox = new InMemoryOutbox();

    const result = await recordPayment(
      { db: STUB_DB, repo, outbox, clock, eventBus },
      { invoiceId: newInvoiceId(), paymentId: newPaymentId(), amountCents: 1000n },
    );

    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error.kind).toBe('InvalidInput');
  });

  it('rejects overpayment', async () => {
    const repo = new InMemoryInvoiceRepo();
    const clock = new FixedClock(new Date('2025-02-01T10:00:00Z'));
    const eventBus = new InProcessEventBus<InvoicingEventMap>();
    const outbox = new InMemoryOutbox();

    const invoice = buildSentInvoice();
    repo.save(invoice);
    const overAmount = total(invoice).cents + 1n;

    const result = await recordPayment(
      { db: STUB_DB, repo, outbox, clock, eventBus },
      {
        invoiceId: invoice.id,
        paymentId: newPaymentId(),
        amountCents: overAmount,
      },
    );

    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error.kind).toBe('Overpayment');
  });

  it('rejects payment on paid invoice', async () => {
    const repo = new InMemoryInvoiceRepo();
    const clock = new FixedClock(new Date('2025-02-01T10:00:00Z'));
    const eventBus = new InProcessEventBus<InvoicingEventMap>();
    const outbox = new InMemoryOutbox();

    const invoice = buildPaidInvoice();
    repo.save(invoice);

    const result = await recordPayment(
      { db: STUB_DB, repo, outbox, clock, eventBus },
      {
        invoiceId: invoice.id,
        paymentId: newPaymentId(),
        amountCents: 100n,
      },
    );

    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error.kind).toBe('AlreadyPaid');
  });
});
