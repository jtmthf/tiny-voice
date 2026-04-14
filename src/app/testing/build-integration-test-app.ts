import { setupDb } from '@/shared/testing/db-fixture';
import { SqliteClientRepo } from '@/clients/index';
import { SqliteInvoiceRepo } from '@/invoicing/index';
import { SqliteRevenueReadModel } from '@/reporting/index';
import { SqliteOutbox } from '@/shared/events/sqlite-outbox';
import type { AppDeps } from '../app-deps';
import { buildTestApp } from './build-test-app';
import type { CapturingNotificationSender } from '@/invoicing/index';

export interface IntegrationTestAppResult {
  readonly app: AppDeps;
  readonly teardown: () => void;
  readonly capturing: {
    readonly notifications: CapturingNotificationSender;
  };
}

/**
 * Like buildTestApp but uses an in-memory SQLite database with real
 * SQL-backed repos. Migrations are applied automatically.
 */
export function buildIntegrationTestApp(
  overrides: Partial<AppDeps> = {},
): IntegrationTestAppResult {
  const { db, teardown } = setupDb();

  const clientRepo = overrides.clientRepo ?? new SqliteClientRepo(db);
  const invoiceRepo = overrides.invoiceRepo ?? new SqliteInvoiceRepo(db);
  const revenueReadModel = overrides.revenueReadModel ?? new SqliteRevenueReadModel(db);
  const outbox = overrides.outbox ?? new SqliteOutbox(db);

  const result = buildTestApp({
    ...overrides,
    db,
    clientRepo,
    invoiceRepo,
    revenueReadModel,
    outbox,
  });

  return {
    app: result.app,
    teardown,
    capturing: result.capturing,
  };
}
