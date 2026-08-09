import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { Database } from '@/shared/db/database';
import { setupDb } from '@/shared/testing/db-fixture';
import { InProcessEventBus } from '@/shared/events/in-process-event-bus';
import { SqliteOutbox } from '@/shared/events/sqlite-outbox';
import { CapturingLogger } from '@/shared/logger/capturing-logger';
import { SqliteRevenueReadModel } from '@/reporting/adapters/sqlite-revenue-read-model';
import { registerRevenueProjection } from '@/reporting/projections/register-revenue-projection';
import { newPaymentId } from '@/shared/ids/payment-id';
import type { YearMonth } from '@/shared/time/year-month';
import { sendInvoice, recordPayment, total } from '../entities/invoice';
import type { InvoicingEventMap } from '../events/invoicing-event-map';
import { SqliteInvoiceRepo } from '../adapters/sqlite-invoice-repo';
import { buildDraftInvoice, buildLineItem, buildSentInvoice } from '../testing/invoice-factory';
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
    eventBus.subscribe('InvoiceSent', (e) => {
      published.push(e);
    });

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

    await applyInvoiceCommand({ db, repo, outbox, eventBus }, { invoiceId: invoice.id }, (inv) =>
      sendInvoice(inv, NOW),
    ).catch(() => {
      /* deliberately not asserting reject/resolve here — see plan 004 */
    });

    expect(repo.findById(invoice.id)?.status).toBe('sent');

    const rows = db.prepare<OutboxRow>('SELECT event_name FROM outbox').all();
    expect(rows).toEqual([{ event_name: 'InvoiceSent' }]);
  });

  it('resolves ok when a subscriber throws, and logs outbox.drain.failed instead of rejecting', async () => {
    eventBus.subscribe('InvoiceSent', () => {
      throw new Error('subscriber boom');
    });
    const logger = new CapturingLogger();

    const invoice = buildDraftInvoice({ lineItems: [buildLineItem()] });
    repo.save(invoice);

    const result = await applyInvoiceCommand(
      { db, repo, outbox, eventBus, logger },
      { invoiceId: invoice.id },
      (inv) => sendInvoice(inv, NOW),
    );

    expect(result.isOk()).toBe(true);
    expect(repo.findById(invoice.id)?.status).toBe('sent');

    const rows = db.prepare<OutboxRow>('SELECT event_name FROM outbox').all();
    expect(rows).toEqual([{ event_name: 'InvoiceSent' }]);

    const warnEntry = logger.entries.find((e) => e.message === 'outbox.drain.failed');
    expect(warnEntry).toBeDefined();
    expect(warnEntry?.meta?.['eventName']).toBe('InvoiceSent');
  });

  it('does not double-count revenue when a redelivered payment event is drained twice', async () => {
    const revenueReadModel = new SqliteRevenueReadModel(db);
    const logger = new CapturingLogger();
    let notificationAttempts = 0;

    registerRevenueProjection({ eventBus, readModel: revenueReadModel, logger });
    eventBus.subscribe('InvoicePaymentRecorded', () => {
      notificationAttempts += 1;
      if (notificationAttempts === 1) throw new Error('notification boom');
    });

    const sent = buildSentInvoice();
    repo.save(sent);
    const paymentId = newPaymentId();
    const amount = total(sent);

    const commandResult = await applyInvoiceCommand(
      { db, repo, outbox, eventBus, logger },
      { invoiceId: sent.id },
      (inv) => recordPayment(inv, { id: paymentId, amount, recordedAt: NOW }),
    );
    expect(commandResult.isOk()).toBe(true);

    // First drain (inside applyInvoiceCommand) partially failed: the projection
    // ran, but the notification subscriber threw, so InProcessEventBus.publish
    // rejected and the row was retained.
    const rowsAfterFirstDrain = db.prepare<OutboxRow>('SELECT event_name FROM outbox').all();
    expect(rowsAfterFirstDrain).toEqual([{ event_name: 'InvoicePaymentRecorded' }]);

    // Second drain (simulating the next command / startup recovery) redelivers
    // the same event; the projection must not double-apply it.
    await outbox.drain(
      (eventName, payload) => eventBus.publish(eventName, payload),
      () => {
        /* ignore */
      },
    );

    const rowsAfterSecondDrain = db.prepare<OutboxRow>('SELECT event_name FROM outbox').all();
    expect(rowsAfterSecondDrain).toHaveLength(0);

    const revenue = revenueReadModel.getByMonth('2025-01' as YearMonth);
    expect(revenue?.total.cents).toBe(amount.cents);
    expect(revenue?.paymentCount).toBe(1);
  });
});
