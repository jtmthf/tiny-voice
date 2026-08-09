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
import { SqliteInvoiceRepo } from '@/invoicing/adapters/sqlite-invoice-repo';
import { PdfKitGenerator } from '@/invoicing/adapters/pdf-kit-generator';
import { StubPdfGenerator } from '@/invoicing/adapters/stub-pdf-generator';
import { ConsoleNotificationSender } from '@/invoicing/adapters/console-notification-sender';
import type { InvoicingEventMap } from '@/invoicing/events/invoicing-event-map';
import { SqliteRevenueReadModel } from '@/reporting/adapters/sqlite-revenue-read-model';
import { registerSubscribers } from './register-subscribers';
import { wireQueries } from './wire-queries';
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
import type { ClientId } from '@/shared/ids/client-id';

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

function createRepositories(
  overrides: Partial<AppDeps>,
  db: Database,
): {
  clientRepo: ClientRepository;
  invoiceRepo: InvoiceRepository;
  revenueReadModel: RevenueReadModel;
} {
  const clientRepo = overrides.clientRepo ?? new SqliteClientRepo(db);
  const invoiceRepo = overrides.invoiceRepo ?? new SqliteInvoiceRepo(db);
  const revenueReadModel = overrides.revenueReadModel ?? new SqliteRevenueReadModel(db);
  return { clientRepo, invoiceRepo, revenueReadModel };
}

function createAdapters(
  overrides: Partial<AppDeps>,
  config: Config,
  logger: Logger,
): {
  pdfGenerator: PdfGenerator;
  notifications: NotificationSender;
} {
  const pdfGenerator =
    overrides.pdfGenerator ??
    (config.get('PDF_GENERATOR') === 'pdfkit' ? new PdfKitGenerator() : new StubPdfGenerator());
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
): {
  eventBus: EventBus<InvoicingEventMap>;
  outbox: Outbox<InvoicingEventMap>;
  unsubscribe: () => void;
} {
  const eventBus = overrides.eventBus ?? new InProcessEventBus<InvoicingEventMap>();
  const outbox = overrides.outbox ?? new SqliteOutbox<InvoicingEventMap>(deps.db);

  // Cross-module wiring: bind clients query for invoicing's notification subscriber
  const invoicingImports = {
    getClient: (id: ClientId) => getClient({ repo: deps.clientRepo }, id),
  };

  const unsubscribe =
    overrides.unsubscribe ??
    registerSubscribers({
      eventBus,
      revenueReadModel: deps.revenueReadModel,
      notifications: deps.notifications,
      invoiceRepo: deps.invoiceRepo,
      getClient: invoicingImports.getClient,
      logger: deps.logger,
      clock: deps.clock,
    });

  // Recover any events left in the outbox from a crash between commit and
  // drain on a previous run. Fire-and-forget: startup must not block on this.
  void outbox
    .drain(
      (eventName, payload) => eventBus.publish(eventName, payload),
      (eventName, error) => deps.logger.warn('outbox.recovery.failed', { eventName, error }),
    )
    .catch((error) => deps.logger.warn('outbox.recovery.error', { error }));

  return { eventBus, outbox, unsubscribe };
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
    db,
    revenueReadModel,
    notifications,
    invoiceRepo,
    clientRepo,
    logger,
    clock,
  });
  const queries =
    overrides.queries ?? wireQueries({ clientRepo, invoiceRepo, revenueReadModel });

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
