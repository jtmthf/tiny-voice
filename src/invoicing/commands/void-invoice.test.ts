import { describe, it, expect } from 'vitest';
import { FixedClock } from '@/shared/time/fixed-clock';
import { InProcessEventBus } from '@/shared/events/in-process-event-bus';
import { InMemoryOutbox } from '@/shared/events/in-memory-outbox';
import type { Database } from '@/shared/db/database';
import type { InvoicingEventMap } from '../events/invoicing-event-map';
import { InMemoryInvoiceRepo } from '../adapters/in-memory-invoice-repo';
import { buildDraftInvoice, buildSentInvoice, buildPaidInvoice, buildLineItem } from '../testing/invoice-factory';
import { voidInvoice } from './void-invoice';

const STUB_DB: Database = {
  prepare() { throw new Error('Stub DB'); },
  exec() { throw new Error('Stub DB'); },
  transaction<T>(fn: () => T): T { return fn(); },
  close() { /* noop */ },
};

describe('voidInvoice command', () => {
  it('voids a draft invoice and emits event', async () => {
    const repo = new InMemoryInvoiceRepo();
    const clock = new FixedClock(new Date('2025-01-20T10:00:00Z'));
    const eventBus = new InProcessEventBus<InvoicingEventMap>();
    const outbox = new InMemoryOutbox();
    const events: InvoicingEventMap['InvoiceVoided'][] = [];
    eventBus.subscribe('InvoiceVoided', (e) => { events.push(e); });

    const invoice = buildDraftInvoice({ lineItems: [buildLineItem()] });
    repo.save(invoice);

    const result = await voidInvoice({ db: STUB_DB, repo, outbox, clock, eventBus }, { invoiceId: invoice.id });
    expect(result.isOk()).toBe(true);
    if (result.isOk()) expect(result.value.status).toBe('void');
    expect(events).toHaveLength(1);
  });

  it('voids a sent invoice', async () => {
    const repo = new InMemoryInvoiceRepo();
    const clock = new FixedClock(new Date('2025-01-20T10:00:00Z'));
    const eventBus = new InProcessEventBus<InvoicingEventMap>();
    const outbox = new InMemoryOutbox();

    const invoice = buildSentInvoice();
    repo.save(invoice);

    const result = await voidInvoice({ db: STUB_DB, repo, outbox, clock, eventBus }, { invoiceId: invoice.id });
    expect(result.isOk()).toBe(true);
    if (result.isOk()) expect(result.value.status).toBe('void');
  });

  it('rejects voiding a paid invoice', async () => {
    const repo = new InMemoryInvoiceRepo();
    const clock = new FixedClock(new Date('2025-01-20T10:00:00Z'));
    const eventBus = new InProcessEventBus<InvoicingEventMap>();
    const outbox = new InMemoryOutbox();

    const invoice = buildPaidInvoice();
    repo.save(invoice);

    const result = await voidInvoice({ db: STUB_DB, repo, outbox, clock, eventBus }, { invoiceId: invoice.id });
    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error.kind).toBe('AlreadyPaid');
  });
});
