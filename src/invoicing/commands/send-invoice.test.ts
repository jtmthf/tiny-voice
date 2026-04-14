import { describe, it, expect } from 'vitest';
import { FixedClock } from '@/shared/time/fixed-clock';
import { InProcessEventBus } from '@/shared/events/in-process-event-bus';
import { InMemoryOutbox } from '@/shared/events/in-memory-outbox';
import type { Database } from '@/shared/db/database';
import type { InvoicingEventMap } from '../events/invoicing-event-map';
import { InMemoryInvoiceRepo } from '../adapters/in-memory-invoice-repo';
import { buildDraftInvoice, buildSentInvoice, buildLineItem } from '../testing/invoice-factory';
import { sendInvoice } from './send-invoice';

const STUB_DB: Database = {
  prepare() { throw new Error('Stub DB'); },
  exec() { throw new Error('Stub DB'); },
  transaction<T>(fn: () => T): T { return fn(); },
  close() { /* noop */ },
};

describe('sendInvoice command', () => {
  it('transitions a draft with items to sent and emits event', async () => {
    const repo = new InMemoryInvoiceRepo();
    const clock = new FixedClock(new Date('2025-01-20T10:00:00Z'));
    const eventBus = new InProcessEventBus<InvoicingEventMap>();
    const outbox = new InMemoryOutbox();
    const events: InvoicingEventMap['InvoiceSent'][] = [];
    eventBus.subscribe('InvoiceSent', (e) => { events.push(e); });

    const invoice = buildDraftInvoice({ lineItems: [buildLineItem()] });
    repo.save(invoice);

    const result = await sendInvoice({ db: STUB_DB, repo, outbox, clock, eventBus }, { invoiceId: invoice.id });
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.status).toBe('sent');
    }

    expect(events).toHaveLength(1);
    expect(events[0]!.invoiceId).toBe(invoice.id);
  });

  it('rejects sending an empty draft', async () => {
    const repo = new InMemoryInvoiceRepo();
    const clock = new FixedClock(new Date('2025-01-20T10:00:00Z'));
    const eventBus = new InProcessEventBus<InvoicingEventMap>();
    const outbox = new InMemoryOutbox();

    const invoice = buildDraftInvoice();
    repo.save(invoice);

    const result = await sendInvoice({ db: STUB_DB, repo, outbox, clock, eventBus }, { invoiceId: invoice.id });
    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error.kind).toBe('NoLineItems');
  });

  it('rejects sending an already-sent invoice', async () => {
    const repo = new InMemoryInvoiceRepo();
    const clock = new FixedClock(new Date('2025-01-20T10:00:00Z'));
    const eventBus = new InProcessEventBus<InvoicingEventMap>();
    const outbox = new InMemoryOutbox();

    const invoice = buildSentInvoice();
    repo.save(invoice);

    const result = await sendInvoice({ db: STUB_DB, repo, outbox, clock, eventBus }, { invoiceId: invoice.id });
    expect(result.isErr()).toBe(true);
  });
});
