import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildTestApp } from './testing/build-test-app';
import { buildIntegrationTestApp } from './testing/build-integration-test-app';
import type { AppDeps } from './app-deps';
import type { CapturingNotificationSender } from '@/invoicing/adapters/capturing-notification-sender';
import { createClient } from '@/clients/commands/create-client';
import { createInvoice as createInvoiceCommand } from '@/invoicing/commands/create-invoice';
import { sendInvoice as sendInvoiceCommand } from '@/invoicing/commands/send-invoice';
import { recordPayment as recordPaymentCommand } from '@/invoicing/commands/record-payment';
import { expectOk } from '@/shared/testing/expect-ok';
import { newInvoiceId } from '@/shared/ids/invoice-id';
import { newLineItemId } from '@/shared/ids/line-item-id';
import { newPaymentId } from '@/shared/ids/payment-id';
import type { DueDate } from '@/shared/time/due-date';
import type { TaxRate } from '@/invoicing/value-objects/tax-rate';
import type { YearMonth } from '@/shared/time/year-month';

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
    const sendResult = await sendInvoiceCommand(
      { db: app.db, repo: app.invoiceRepo, outbox: app.outbox, clock: app.clock, eventBus: app.eventBus },
      { invoiceId },
    );
    expect(sendResult.isOk()).toBe(true);

    // Verify InvoiceSent subscriber fired
    expect(notifications.sent.some((s) => s.type === 'invoiceSent')).toBe(true);

    // 5. Record payment (full amount: 2 * $50.00 = $100.00 + 10% tax = $110.00 = 11000 cents)
    const payResult = await recordPaymentCommand(
      { db: app.db, repo: app.invoiceRepo, outbox: app.outbox, clock: app.clock, eventBus: app.eventBus },
      {
        invoiceId,
        paymentId: newPaymentId(),
        amountCents: 11000n,
      },
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
    await sendInvoiceCommand(
      { db: app.db, repo: app.invoiceRepo, outbox: app.outbox, clock: app.clock, eventBus: app.eventBus },
      { invoiceId },
    );

    // Record payment
    await recordPaymentCommand(
      { db: app.db, repo: app.invoiceRepo, outbox: app.outbox, clock: app.clock, eventBus: app.eventBus },
      {
        invoiceId,
        paymentId: newPaymentId(),
        amountCents: 2500n,
      },
    );

    // Verify through queries
    const summary = app.queries.invoicing.getInvoiceSummary(invoiceId);
    expect(summary!.status).toBe('paid');

    const revenue = app.queries.reporting.getRevenueByMonth('2026-04' as YearMonth);
    expect(revenue!.total.cents).toBe(2500n);

    expect(notifications.sent).toHaveLength(2); // invoiceSent + paymentReceived
  });
});
