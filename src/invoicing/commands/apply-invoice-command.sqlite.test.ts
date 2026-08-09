import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { Database } from '@/shared/db/database';
import { setupDb } from '@/shared/testing/db-fixture';
import { InProcessEventBus } from '@/shared/events/in-process-event-bus';
import { SqliteOutbox } from '@/shared/events/sqlite-outbox';
import { sendInvoice } from '../entities/invoice';
import type { InvoicingEventMap } from '../events/invoicing-event-map';
import { SqliteInvoiceRepo } from '../adapters/sqlite-invoice-repo';
import { buildDraftInvoice, buildLineItem } from '../testing/invoice-factory';
import { applyInvoiceCommand } from './apply-invoice-command';

interface OutboxRow {
  event_name: string;
}

const NOW = new Date('2025-01-20T10:00:00Z');

describe('applyInvoiceCommand (real SQLite outbox)', () => {
  let db: Database;
  let teardown: () => void;
  let repo: SqliteInvoiceRepo;
  let eventBus: InProcessEventBus<InvoicingEventMap>;
  let outbox: SqliteOutbox<InvoicingEventMap>;

  beforeEach(() => {
    const fixture = setupDb();
    db = fixture.db;
    teardown = fixture.teardown;
    repo = new SqliteInvoiceRepo(db);
    eventBus = new InProcessEventBus<InvoicingEventMap>();
    outbox = new SqliteOutbox<InvoicingEventMap>(db);
  });

  afterEach(() => {
    teardown();
  });

  it('commits the aggregate, publishes the event, and empties the outbox', async () => {
    const published: InvoicingEventMap['InvoiceSent'][] = [];
    eventBus.subscribe('InvoiceSent', (e) => { published.push(e); });

    const invoice = buildDraftInvoice({ lineItems: [buildLineItem()] });
    repo.save(invoice);

    const result = await applyInvoiceCommand(
      { db, repo, outbox, eventBus },
      { invoiceId: invoice.id },
      (inv) => sendInvoice(inv, NOW),
    );

    expect(result.isOk()).toBe(true);
    expect(repo.findById(invoice.id)?.status).toBe('sent');
    expect(published).toHaveLength(1);
    expect(published[0]!.invoiceId).toBe(invoice.id);

    const rows = db.prepare<OutboxRow>('SELECT event_name FROM outbox').all();
    expect(rows).toHaveLength(0);
  });

  it('keeps the committed save and retains the outbox row when a subscriber throws', async () => {
    eventBus.subscribe('InvoiceSent', () => {
      throw new Error('subscriber boom');
    });

    const invoice = buildDraftInvoice({ lineItems: [buildLineItem()] });
    repo.save(invoice);

    await applyInvoiceCommand(
      { db, repo, outbox, eventBus },
      { invoiceId: invoice.id },
      (inv) => sendInvoice(inv, NOW),
    ).catch(() => {
      /* deliberately not asserting reject/resolve here — see plan 004 */
    });

    expect(repo.findById(invoice.id)?.status).toBe('sent');

    const rows = db.prepare<OutboxRow>('SELECT event_name FROM outbox').all();
    expect(rows).toEqual([{ event_name: 'InvoiceSent' }]);
  });
});
