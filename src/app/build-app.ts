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
import { setRpcContextProvider } from './rpc/get-rpc-context';
import { registerSubscribers } from './register-subscribers';
import type { AppDeps } from './app-deps';
import type { Config } from '@/shared/config/config';
import type { Clock } from '@/shared/time/clock';
import type { Logger } from '@/shared/logger/logger';
import type { FeatureFlags } from '@/shared/flags/feature-flags';
import type { Database } from '@/shared/db/database';
import type { ClientRepository } from '@/clients/ports/client-repository';
import type { InvoiceRepository } from '@/invoicing/ports/invoice-repository';
import type { PdfGenerator } from '@/invoicing/ports/pdf-generator';
import type { NotificationSender } from '@/invoicing/ports/notification-sender';
import type { EventBus } from '@/shared/events/event-bus';
import type { Outbox } from '@/shared/events/outbox';
import type { RevenueReadModel } from '@/reporting/ports/revenue-read-model';

function createInfrastructure(overrides: Partial<AppDeps>): {
  config: Config;
  clock: Clock;
  logger: Logger;
  featureFlags: FeatureFlags;
} {
  const config = overrides.config ?? new EnvConfig();
  const clock = overrides.clock ?? new SystemClock();
  const logger = overrides.logger ?? new ConsoleLogger();
  const featureFlags = overrides.featureFlags ?? new ConfigFeatureFlags(config);
  return { config, clock, logger, featureFlags };
}

function createDatabase(overrides: Partial<AppDeps>, config: Config, logger: Logger): Database {
  if (overrides.db) return overrides.db;
  const dbPath = config.get('DATABASE_PATH');
  const database = new SqliteDatabase(dbPath);
  // import.meta.dirname may be undefined in Turbopack builds; fall back to cwd-relative.
  const baseDir = import.meta.dirname ?? process.cwd();
  const migrationsDir = import.meta.dirname
    ? resolve(baseDir, '../../migrations')
    : resolve(baseDir, 'migrations');
  runMigrations(database, migrationsDir, logger);
  return database;
}

function createRepositories(overrides: Partial<AppDeps>, db: Database): {
  clientRepo: ClientRepository;
  invoiceRepo: InvoiceRepository;
  revenueReadModel: RevenueReadModel;
} {
  const clientRepo = overrides.clientRepo ?? new SqliteClientRepo(db);
  const invoiceRepo = overrides.invoiceRepo ?? new SqliteInvoiceRepo(db);
  const revenueReadModel = overrides.revenueReadModel ?? new SqliteRevenueReadModel(db);
  return { clientRepo, invoiceRepo, revenueReadModel };
}

function createAdapters(overrides: Partial<AppDeps>, config: Config, logger: Logger): {
  pdfGenerator: PdfGenerator;
  notifications: NotificationSender;
} {
  const pdfGenerator = overrides.pdfGenerator ?? (
    config.get('PDF_GENERATOR') === 'pdfkit'
      ? new PdfKitGenerator()
      : new StubPdfGenerator()
  );
  const notifications = overrides.notifications ?? new ConsoleNotificationSender(logger);
  return { pdfGenerator, notifications };
}

function createEventingAndSubscribers(
  overrides: Partial<AppDeps>,
  deps: {
    db: Database;
    revenueReadModel: RevenueReadModel;
    notifications: NotificationSender;
    invoiceRepo: InvoiceRepository;
    clientRepo: ClientRepository;
    logger: Logger;
    clock: Clock;
  },
): { eventBus: EventBus<InvoicingEventMap>; outbox: Outbox<InvoicingEventMap>; unsubscribe: () => void } {
  const eventBus = overrides.eventBus ?? new InProcessEventBus<InvoicingEventMap>();
  const outbox = overrides.outbox ?? new SqliteOutbox<InvoicingEventMap>(deps.db);
  const unsubscribe = overrides.unsubscribe ?? registerSubscribers({
    eventBus,
    revenueReadModel: deps.revenueReadModel,
    notifications: deps.notifications,
    invoiceRepo: deps.invoiceRepo,
    clientRepo: deps.clientRepo,
    logger: deps.logger,
    clock: deps.clock,
  });
  return { eventBus, outbox, unsubscribe };
}

function createQueries(
  overrides: Partial<AppDeps>,
  deps: {
    clientRepo: ClientRepository;
    invoiceRepo: InvoiceRepository;
    revenueReadModel: RevenueReadModel;
  },
): AppDeps['queries'] {
  if (overrides.queries) return overrides.queries;
  return {
    clients: {
      getClient: (id) => getClient({ repo: deps.clientRepo }, id),
      listClients: () => listClients({ repo: deps.clientRepo }),
    },
    invoicing: {
      getInvoiceSummary: (id) => getInvoiceSummary({ repo: deps.invoiceRepo }, id),
      getInvoiceLineItems: (id) => getInvoiceLineItems({ repo: deps.invoiceRepo }, id),
      getInvoicePayments: (id) => getInvoicePayments({ repo: deps.invoiceRepo }, id),
      listInvoices: (filters) => listInvoiceSummaries({ repo: deps.invoiceRepo }, filters),
      getOutstandingByClient: (clientId) => getOutstandingByClient({ repo: deps.invoiceRepo }, clientId),
    },
    reporting: {
      getRevenueByMonth: (month) => getRevenueByMonth({ readModel: deps.revenueReadModel }, month),
      getRevenueByYear: (year) => getRevenueByYear({ readModel: deps.revenueReadModel }, year),
      listAllRevenue: () => deps.revenueReadModel.listAll(),
    },
  };
}

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
  const { config, clock, logger, featureFlags } = createInfrastructure(overrides);
  const db = createDatabase(overrides, config, logger);
  const { clientRepo, invoiceRepo, revenueReadModel } = createRepositories(overrides, db);
  const { pdfGenerator, notifications } = createAdapters(overrides, config, logger);
  const { eventBus, outbox, unsubscribe } = createEventingAndSubscribers(overrides, {
    db, revenueReadModel, notifications, invoiceRepo, clientRepo, logger, clock,
  });
  const queries = createQueries(overrides, { clientRepo, invoiceRepo, revenueReadModel });

  setRpcContextProvider(() => ({
    db, clientRepo, invoiceRepo, pdfGenerator, notifications,
    outbox, eventBus, clock, logger, featureFlags,
  }));

  return {
    config, clock, logger, featureFlags,
    eventBus, outbox, db,
    clientRepo, invoiceRepo, revenueReadModel,
    pdfGenerator, notifications,
    queries, unsubscribe,
  };
}
