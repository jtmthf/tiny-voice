import { EnvConfig } from '@/shared/config/env-config';
import { SystemClock } from '@/shared/time/system-clock';
import { ConsoleLogger } from '@/shared/logger/console-logger';
import { ConfigFeatureFlags } from '@/shared/flags/config-feature-flags';
import { InProcessEventBus } from '@/shared/events/in-process-event-bus';
import { SqliteOutbox } from '@/shared/events/sqlite-outbox';
import { SqliteDatabase } from '@/shared/db/sqlite-database';
import { runMigrations } from '@/shared/db/run-migrations';
import { resolve } from 'node:path';
import {
  SqliteClientRepo,
  getClient,
  listClients,
} from '@/clients/index';
import {
  SqliteInvoiceRepo,
  PdfKitGenerator,
  StubPdfGenerator,
  ConsoleNotificationSender,
  getInvoiceSummary,
  listInvoices,
  getOutstandingByClient,
} from '@/invoicing/index';
import type { InvoicingEventMap, InvoiceSummary } from '@/invoicing/index';
import {
  SqliteRevenueReadModel,
  getRevenueByMonth,
  getRevenueByYear,
} from '@/reporting/index';
import { setRpcContext } from './rpc/get-rpc-context';
import { registerSubscribers } from './register-subscribers';
import type { AppDeps } from './app-deps';
import {
  subtotal,
  taxAmount,
  total,
  paidAmount,
  outstandingBalance,
} from '@/invoicing/index';

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
  //    listInvoices returns Invoice[], but AppDeps.queries.invoicing.listInvoices
  //    returns InvoiceSummary[]. We wrap and convert here.
  const queries = overrides.queries ?? {
    clients: {
      getClient: (id) => getClient({ repo: clientRepo }, id),
      listClients: () => listClients({ repo: clientRepo }),
    },
    invoicing: {
      getInvoiceSummary: (id) => getInvoiceSummary({ repo: invoiceRepo }, id),
      listInvoices: (filters) => {
        const invoices = listInvoices({ repo: invoiceRepo }, filters);
        return invoices.map((inv): InvoiceSummary => ({
          id: inv.id,
          clientId: inv.clientId,
          status: inv.status,
          lineItemCount: inv.lineItems.length,
          subtotal: subtotal(inv),
          taxAmount: taxAmount(inv),
          total: total(inv),
          paidAmount: paidAmount(inv),
          outstandingBalance: outstandingBalance(inv),
          dueDate: inv.dueDate,
          createdAt: inv.createdAt,
        }));
      },
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
