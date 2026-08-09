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
import type { InvoicingEventMap } from '@/invoicing/events/invoicing-event-map';
import { InMemoryRevenueReadModel } from '@/reporting/adapters/in-memory-revenue-read-model';
import { getClient } from '@/clients/queries/get-client';
import type { ClientId } from '@/shared/ids/client-id';
import { registerSubscribers } from '../register-subscribers';
import { wireQueries } from '../wire-queries';
import type { AppDeps } from '../app-deps';
import type { Database } from '@/shared/db/database';

/** Stub database for unit tests — transaction() is a passthrough for in-memory adapters. */
const STUB_DB: Database = {
  prepare() {
    throw new Error('Stub DB: not available in unit test app');
  },
  exec() {
    throw new Error('Stub DB: not available in unit test app');
  },
  transaction<T>(fn: () => T): T {
    return fn();
  },
  close() {
    /* noop */
  },
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
  const outbox = overrides.outbox ?? new InMemoryOutbox<InvoicingEventMap>();

  const clientRepo = overrides.clientRepo ?? new InMemoryClientRepo();
  const invoiceRepo = overrides.invoiceRepo ?? new InMemoryInvoiceRepo();
  const revenueReadModel = overrides.revenueReadModel ?? new InMemoryRevenueReadModel();
  const pdfGenerator = overrides.pdfGenerator ?? new StubPdfGenerator();
  const notifications = overrides.notifications ?? new CapturingNotificationSender();

  const unsubscribe =
    overrides.unsubscribe ??
    registerSubscribers({
      eventBus,
      revenueReadModel,
      notifications,
      invoiceRepo,
      getClient: (id: ClientId) => getClient({ repo: clientRepo }, id),
      logger,
      clock,
    });

  const queries =
    overrides.queries ?? wireQueries({ clientRepo, invoiceRepo, revenueReadModel });

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
