import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildTestApp } from './testing/build-test-app';
import { buildIntegrationTestApp } from './testing/build-integration-test-app';
import { buildApp } from './build-app';
import type { AppDeps } from './app-deps';
import type { CapturingNotificationSender } from '@/invoicing/adapters/capturing-notification-sender';
import { createClient } from '@/clients/commands/create-client';
import { createInvoice as createInvoiceCommand } from '@/invoicing/commands/create-invoice';
import { applyInvoiceCommand } from '@/invoicing/commands/apply-invoice-command';
import { recordPayment, sendInvoice } from '@/invoicing/entities/invoice';
import { Money } from '@/shared/money/money';
import { expectOk } from '@/shared/testing/expect-ok';
import { newInvoiceId } from '@/shared/ids/invoice-id';
import { newClientId } from '@/shared/ids/client-id';
import { newLineItemId } from '@/shared/ids/line-item-id';
import { newPaymentId } from '@/shared/ids/payment-id';
import type { DueDate } from '@/shared/time/due-date';
import type { TaxRate } from '@/invoicing/value-objects/tax-rate';
import type { YearMonth } from '@/shared/time/year-month';
import { InMemoryConfig } from '@/shared/config/in-memory-config';
import { FixedClock } from '@/shared/time/fixed-clock';
import { CapturingLogger } from '@/shared/logger/capturing-logger';
import { InMemoryFeatureFlags } from '@/shared/flags/in-memory-feature-flags';
import { InProcessEventBus } from '@/shared/events/in-process-event-bus';
import { SqliteOutbox } from '@/shared/events/sqlite-outbox';
import type { Outbox } from '@/shared/events/outbox';
import { setupDb } from '@/shared/testing/db-fixture';
import type { InvoicingEventMap } from '@/invoicing/events/invoicing-event-map';

describe('buildTestApp', () => {
  let app: AppDeps;
  let notifications: CapturingNotificationSender;

  beforeEach(() => {
    const result = buildTestApp();
    app = result.app;
    notifications = result.capturing.notifications;
  });

  it('returns a fully shaped AppDeps', () => {
    expect(app.config).toBeDefined();
    expect(app.clock).toBeDefined();
    expect(app.logger).toBeDefined();
    expect(app.featureFlags).toBeDefined();
    expect(app.eventBus).toBeDefined();
    expect(app.db).toBeDefined();
    expect(app.clientRepo).toBeDefined();
    expect(app.invoiceRepo).toBeDefined();
    expect(app.revenueReadModel).toBeDefined();
    expect(app.pdfGenerator).toBeDefined();
    expect(app.notifications).toBeDefined();
    expect(app.queries).toBeDefined();
    expect(app.queries.clients.getClient).toBeTypeOf('function');
    expect(app.queries.clients.listClients).toBeTypeOf('function');
    expect(app.queries.invoicing.getInvoiceSummary).toBeTypeOf('function');
    expect(app.queries.invoicing.listInvoices).toBeTypeOf('function');
    expect(app.queries.invoicing.getOutstandingByClient).toBeTypeOf('function');
    expect(app.queries.reporting.getRevenueByMonth).toBeTypeOf('function');
    expect(app.queries.reporting.getRevenueByYear).toBeTypeOf('function');
    expect(app.queries.reporting.listAllRevenue).toBeTypeOf('function');
    expect(app.unsubscribe).toBeTypeOf('function');
  });

  it('exercises a full command path end-to-end', async () => {
    // 1. Create client
    const clientResult = createClient(
      { repo: app.clientRepo, clock: app.clock, logger: app.logger },
      { name: 'Acme Corp', email: 'billing@acme.com' },
    );
    const client = expectOk(clientResult);

    // 2. Create invoice with line items atomically
    const invoiceId = newInvoiceId();
    const createResult = createInvoiceCommand(
      { repo: app.invoiceRepo, clock: app.clock },
      {
        id: invoiceId,
        clientId: client.id,
        taxRate: 0.1 as TaxRate,
        dueDate: '2026-05-13' as DueDate,
        lineItems: [
          {
            id: newLineItemId(),
            description: 'Consulting',
            quantity: 2,
            unitPriceCents: 5000n,
          },
        ],
      },
    );
    expect(createResult.isOk()).toBe(true);

    // 4. Send invoice
    const sendResult = await applyInvoiceCommand(
      { db: app.db, repo: app.invoiceRepo, outbox: app.outbox, eventBus: app.eventBus },
      { invoiceId },
      (invoice) => sendInvoice(invoice, app.clock.now()),
    );
    expect(sendResult.isOk()).toBe(true);

    // Verify InvoiceSent subscriber fired
    expect(notifications.sent.some((s) => s.type === 'invoiceSent')).toBe(true);

    // 5. Record payment (full amount: 2 * $50.00 = $100.00 + 10% tax = $110.00 = 11000 cents)
    const payResult = await applyInvoiceCommand(
      { db: app.db, repo: app.invoiceRepo, outbox: app.outbox, eventBus: app.eventBus },
      { invoiceId },
      (invoice) =>
        recordPayment(invoice, {
          id: newPaymentId(),
          amount: Money.fromCents(11000n),
          recordedAt: app.clock.now(),
        }),
    );
    expect(payResult.isOk()).toBe(true);

    // Verify InvoicePaymentRecorded subscriber fired
    expect(notifications.sent.some((s) => s.type === 'paymentReceived')).toBe(true);

    // 6. Query revenue
    const revenue = app.queries.reporting.getRevenueByMonth('2026-04' as YearMonth);
    expect(revenue).not.toBeNull();
    expect(revenue!.total.cents).toBe(11000n);

    // 7. Query invoice summary
    const summary = app.queries.invoicing.getInvoiceSummary(invoiceId);
    expect(summary).not.toBeNull();
    expect(summary!.status).toBe('paid');

    // 8. Query client
    const queriedClient = app.queries.clients.getClient(client.id);
    expect(queriedClient).not.toBeNull();
    expect(queriedClient!.name).toBe('Acme Corp');

    // 9. List queries
    const clients = app.queries.clients.listClients();
    expect(clients).toHaveLength(1);

    const invoices = app.queries.invoicing.listInvoices();
    expect(invoices).toHaveLength(1);
    expect(invoices[0]!.status).toBe('paid');

    const allRevenue = app.queries.reporting.listAllRevenue();
    expect(allRevenue).toHaveLength(1);
  });
});

describe('buildIntegrationTestApp', () => {
  let app: AppDeps;
  let teardown: () => void;
  let notifications: CapturingNotificationSender;

  beforeEach(() => {
    const result = buildIntegrationTestApp();
    app = result.app;
    teardown = result.teardown;
    notifications = result.capturing.notifications;
  });

  afterEach(() => {
    app.unsubscribe();
    teardown();
  });

  it('exercises the full path with SQLite-backed repos', async () => {
    // Create client
    const clientResult = createClient(
      { repo: app.clientRepo, clock: app.clock, logger: app.logger },
      { name: 'TestCo', email: 'test@testco.com' },
    );
    const client = expectOk(clientResult);

    // Create invoice with line items atomically
    const invoiceId = newInvoiceId();
    const createResult = createInvoiceCommand(
      { repo: app.invoiceRepo, clock: app.clock },
      {
        id: invoiceId,
        clientId: client.id,
        taxRate: 0 as TaxRate,
        dueDate: '2026-05-01' as DueDate,
        lineItems: [
          {
            id: newLineItemId(),
            description: 'Widget',
            quantity: 1,
            unitPriceCents: 2500n,
          },
        ],
      },
    );
    expect(createResult.isOk()).toBe(true);

    // Send
    await applyInvoiceCommand(
      { db: app.db, repo: app.invoiceRepo, outbox: app.outbox, eventBus: app.eventBus },
      { invoiceId },
      (invoice) => sendInvoice(invoice, app.clock.now()),
    );

    // Record payment
    await applyInvoiceCommand(
      { db: app.db, repo: app.invoiceRepo, outbox: app.outbox, eventBus: app.eventBus },
      { invoiceId },
      (invoice) =>
        recordPayment(invoice, {
          id: newPaymentId(),
          amount: Money.fromCents(2500n),
          recordedAt: app.clock.now(),
        }),
    );

    // Verify through queries
    const summary = app.queries.invoicing.getInvoiceSummary(invoiceId);
    expect(summary!.status).toBe('paid');

    const revenue = app.queries.reporting.getRevenueByMonth('2026-04' as YearMonth);
    expect(revenue!.total.cents).toBe(2500n);

    expect(notifications.sent).toHaveLength(2); // invoiceSent + paymentReceived
  });
});

describe('buildApp startup recovery drain', () => {
  it('drains an outbox row left over from a previous run at startup', async () => {
    const { db, teardown } = setupDb();
    const invoiceId = newInvoiceId();
    const clientId = newClientId();

    db.prepare('INSERT INTO outbox (event_name, payload) VALUES (?, ?)').run(
      'InvoiceSent',
      JSON.stringify({
        invoiceId,
        clientId,
        totalCents: '1000',
        sentAt: '2026-04-13T00:00:00.000Z',
      }),
    );

    const eventBus = new InProcessEventBus<InvoicingEventMap>();
    let received: InvoicingEventMap['InvoiceSent'] | undefined;
    eventBus.subscribe('InvoiceSent', (payload) => {
      received = payload;
    });

    // The recovery drain is fire-and-forget inside buildApp, so capture the
    // promise it kicks off to deterministically await its completion here.
    const rawOutbox = new SqliteOutbox<InvoicingEventMap>(db);
    let drainPromise: Promise<void> | undefined;
    const outbox: Outbox<InvoicingEventMap> = new Proxy(rawOutbox, {
      get(target, prop, receiver) {
        if (prop === 'drain') {
          return (...args: Parameters<typeof rawOutbox.drain>) => {
            drainPromise = target.drain(...args);
            return drainPromise;
          };
        }
        return Reflect.get(target, prop, receiver);
      },
    });

    const app = buildApp({
      config: new InMemoryConfig(),
      clock: new FixedClock(new Date('2026-04-13T00:00:00Z')),
      logger: new CapturingLogger(),
      featureFlags: new InMemoryFeatureFlags({ lateFees: false }),
      db,
      eventBus,
      outbox,
    });

    try {
      expect(drainPromise).toBeDefined();
      await drainPromise;

      expect(received?.invoiceId).toBe(invoiceId);

      const rows = db.prepare('SELECT * FROM outbox').all();
      expect(rows).toHaveLength(0);
    } finally {
      app.unsubscribe();
      teardown();
    }
  });
});
