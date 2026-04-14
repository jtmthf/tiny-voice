import { EnvConfig } from '@/shared/config/env-config';
import { SystemClock } from '@/shared/time/system-clock';
import { ConsoleLogger } from '@/shared/logger/console-logger';
import { ConfigFeatureFlags } from '@/shared/flags/config-feature-flags';
import { InProcessEventBus } from '@/shared/events/in-process-event-bus';
import { SqliteOutbox } from '@/shared/events/sqlite-outbox';
import { SqliteDatabase } from '@/shared/db/sqlite-database';
import { runMigrations } from '@/shared/db/run-migrations';
import { resolve } from 'node:path';
import { SqliteClientRepo } from '@/clients/adapters/sqlite-client-repo';
import { getClient } from '@/clients/queries/get-client';
import { listClients } from '@/clients/queries/list-clients';
import { SqliteInvoiceRepo } from '@/invoicing/adapters/sqlite-invoice-repo';
import { PdfKitGenerator } from '@/invoicing/adapters/pdf-kit-generator';
import { StubPdfGenerator } from '@/invoicing/adapters/stub-pdf-generator';
import { ConsoleNotificationSender } from '@/invoicing/adapters/console-notification-sender';
import { getInvoiceSummary } from '@/invoicing/queries/get-invoice-summary';
import { getInvoiceLineItems } from '@/invoicing/queries/get-invoice-line-items';
import { getInvoicePayments } from '@/invoicing/queries/get-invoice-payments';
import { listInvoiceSummaries } from '@/invoicing/queries/list-invoice-summaries';
import { getOutstandingByClient } from '@/invoicing/queries/get-outstanding-by-client';
import type { InvoicingEventMap } from '@/invoicing/events/invoicing-event-map';
import { SqliteRevenueReadModel } from '@/reporting/adapters/sqlite-revenue-read-model';
import { getRevenueByMonth } from '@/reporting/queries/get-revenue-by-month';
import { getRevenueByYear } from '@/reporting/queries/get-revenue-by-year';
import { setRpcContext } from './rpc/get-rpc-context';
import { registerSubscribers } from './register-subscribers';
import type { AppDeps } from './app-deps';
/**
 * Composition root. Constructs all dependencies, wires subscribers,
 * and returns the fully assembled AppDeps.
 *
 * `overrides` let tests swap any piece without constructing the defaults.
 *
 * NOTE: The database must have migrations applied. For production,
 * run `pnpm migrate` before starting the app. For tests, use
 * `buildTestApp()` or `buildIntegrationTestApp()` which handle this.
 */
export function buildApp(overrides: Partial<AppDeps> = {}): AppDeps {
  // 1. Config
  const config = overrides.config ?? new EnvConfig();

  // 2. Infrastructure derived from config
  const clock = overrides.clock ?? new SystemClock();
  const logger = overrides.logger ?? new ConsoleLogger();
  const featureFlags = overrides.featureFlags ?? new ConfigFeatureFlags(config);

  // 3. Database
  const db = overrides.db ?? (() => {
    const dbPath = config.get('DATABASE_PATH');
    const database = new SqliteDatabase(dbPath);
    // import.meta.dirname may be undefined in Turbopack builds; fall back to cwd-relative.
    const baseDir = import.meta.dirname ?? process.cwd();
    const migrationsDir = import.meta.dirname
      ? resolve(baseDir, '../../migrations')
      : resolve(baseDir, 'migrations');
    runMigrations(database, migrationsDir, logger);
    return database;
  })();

  // 4. Repositories
  const clientRepo = overrides.clientRepo ?? new SqliteClientRepo(db);
  const invoiceRepo = overrides.invoiceRepo ?? new SqliteInvoiceRepo(db);
  const revenueReadModel = overrides.revenueReadModel ?? new SqliteRevenueReadModel(db);

  // 5. PdfGenerator
  const pdfGenerator = overrides.pdfGenerator ?? (
    config.get('PDF_GENERATOR') === 'pdfkit'
      ? new PdfKitGenerator()
      : new StubPdfGenerator()
  );

  // 6. NotificationSender
  const notifications = overrides.notifications ?? new ConsoleNotificationSender(logger);

  // 7. EventBus + Outbox
  const eventBus = overrides.eventBus ?? new InProcessEventBus<InvoicingEventMap>();
  const outbox = overrides.outbox ?? new SqliteOutbox(db);

  // 8. Subscribers (revenue projection + notifications)
  const unsubscribe = overrides.unsubscribe ?? registerSubscribers({
    eventBus,
    revenueReadModel,
    notifications,
    invoiceRepo,
    logger,
    clock,
  });

  // 9. Build queries — closures over repos/readModel calling each module's query functions.
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

  // 10. Set RPC context so the oRPC handler can access deps
  setRpcContext({
    db,
    clientRepo,
    invoiceRepo,
    pdfGenerator,
    notifications,
    outbox,
    eventBus,
    clock,
    logger,
    featureFlags,
  });

  return {
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
}
