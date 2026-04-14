import { InMemoryConfig } from '@/shared/config/in-memory-config';
import { FixedClock } from '@/shared/time/fixed-clock';
import { CapturingLogger } from '@/shared/logger/capturing-logger';
import { InMemoryFeatureFlags } from '@/shared/flags/in-memory-feature-flags';
import { InProcessEventBus } from '@/shared/events/in-process-event-bus';
import { InMemoryOutbox } from '@/shared/events/in-memory-outbox';
import { InMemoryClientRepo } from '@/clients/adapters/in-memory-client-repo';
import { InMemoryInvoiceRepo } from '@/invoicing/adapters/in-memory-invoice-repo';
import { StubPdfGenerator } from '@/invoicing/adapters/stub-pdf-generator';
import { CapturingNotificationSender } from '@/invoicing/adapters/capturing-notification-sender';
import { getInvoiceSummary } from '@/invoicing/queries/get-invoice-summary';
import { getInvoiceLineItems } from '@/invoicing/queries/get-invoice-line-items';
import { getInvoicePayments } from '@/invoicing/queries/get-invoice-payments';
import { listInvoiceSummaries } from '@/invoicing/queries/list-invoice-summaries';
import { getOutstandingByClient } from '@/invoicing/queries/get-outstanding-by-client';
import type { InvoicingEventMap } from '@/invoicing/events/invoicing-event-map';
import { InMemoryRevenueReadModel } from '@/reporting/adapters/in-memory-revenue-read-model';
import { getRevenueByMonth } from '@/reporting/queries/get-revenue-by-month';
import { getRevenueByYear } from '@/reporting/queries/get-revenue-by-year';
import { getClient } from '@/clients/queries/get-client';
import { listClients } from '@/clients/queries/list-clients';
import { registerSubscribers } from '../register-subscribers';
import type { AppDeps } from '../app-deps';
import type { Database } from '@/shared/db/database';

/** Stub database for unit tests — transaction() is a passthrough for in-memory adapters. */
const STUB_DB: Database = {
  prepare() { throw new Error('Stub DB: not available in unit test app'); },
  exec() { throw new Error('Stub DB: not available in unit test app'); },
  transaction<T>(fn: () => T): T { return fn(); },
  close() { /* noop */ },
};

export interface TestAppResult {
  readonly app: AppDeps;
  readonly capturing: {
    readonly notifications: CapturingNotificationSender;
  };
}

/**
 * Builds an AppDeps with all in-memory adapters. Does NOT call setRpcContext.
 * Returns both the app and capturing adapters for assertion convenience.
 */
export function buildTestApp(overrides: Partial<AppDeps> = {}): TestAppResult {
  const config = overrides.config ?? new InMemoryConfig();
  const clock = overrides.clock ?? new FixedClock(new Date('2026-04-13T00:00:00Z'));
  const logger = overrides.logger ?? new CapturingLogger();
  const featureFlags = overrides.featureFlags ?? new InMemoryFeatureFlags({ lateFees: false });
  const eventBus = overrides.eventBus ?? new InProcessEventBus<InvoicingEventMap>();
  const db = overrides.db ?? STUB_DB;
  const outbox = overrides.outbox ?? new InMemoryOutbox();

  const clientRepo = overrides.clientRepo ?? new InMemoryClientRepo();
  const invoiceRepo = overrides.invoiceRepo ?? new InMemoryInvoiceRepo();
  const revenueReadModel = overrides.revenueReadModel ?? new InMemoryRevenueReadModel();
  const pdfGenerator = overrides.pdfGenerator ?? new StubPdfGenerator();
  const notifications = overrides.notifications ?? new CapturingNotificationSender();

  const unsubscribe = overrides.unsubscribe ?? registerSubscribers({
    eventBus,
    revenueReadModel,
    notifications,
    invoiceRepo,
    logger,
    clock,
  });

  const queries = overrides.queries ?? {
    clients: {
      getClient: (id) => getClient({ repo: clientRepo }, id),
      listClients: () => listClients({ repo: clientRepo }),
    },
    invoicing: {
      getInvoiceSummary: (id) => getInvoiceSummary({ repo: invoiceRepo }, id),
      getInvoiceLineItems: (id) => getInvoiceLineItems({ repo: invoiceRepo }, id),
      getInvoicePayments: (id) => getInvoicePayments({ repo: invoiceRepo }, id),
      listInvoices: (filters) => listInvoiceSummaries({ repo: invoiceRepo }, filters),
      getOutstandingByClient: (clientId) => getOutstandingByClient({ repo: invoiceRepo }, clientId),
    },
    reporting: {
      getRevenueByMonth: (month) => getRevenueByMonth({ readModel: revenueReadModel }, month),
      getRevenueByYear: (year) => getRevenueByYear({ readModel: revenueReadModel }, year),
      listAllRevenue: () => revenueReadModel.listAll(),
    },
  };

  const app: AppDeps = {
    config,
    clock,
    logger,
    featureFlags,
    eventBus,
    outbox,
    db,
    clientRepo,
    invoiceRepo,
    revenueReadModel,
    pdfGenerator,
    notifications,
    queries,
    unsubscribe,
  };

  return {
    app,
    capturing: {
      notifications: notifications as CapturingNotificationSender,
    },
  };
}
