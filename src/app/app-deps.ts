import type { Config } from '@/shared/config/config';
import type { Clock } from '@/shared/time/clock';
import type { Logger } from '@/shared/logger/logger';
import type { FeatureFlags } from '@/shared/flags/feature-flags';
import type { EventBus } from '@/shared/events/event-bus';
import type { Outbox } from '@/shared/events/outbox';
import type { Database } from '@/shared/db/database';
import type { YearMonth } from '@/shared/time/year-month';
import type { ClientId } from '@/shared/ids/client-id';
import type { InvoiceId } from '@/shared/ids/invoice-id';
import type { Money } from '@/shared/money/money';
import type { Client, ClientRepository } from '@/clients/index';
import type {
  InvoiceRepository,
  PdfGenerator,
  NotificationSender,
  InvoiceSummary,
  LineItemSummary,
  PaymentSummary,
  InvoicingEventMap,
} from '@/invoicing/index';
import type { RevenueReadModel, MonthlyRevenue } from '@/reporting/index';
import type { InvoiceStatus } from '@/invoicing/index';

export interface AppDeps {
  // Infrastructure ports
  readonly config: Config;
  readonly clock: Clock;
  readonly logger: Logger;
  readonly featureFlags: FeatureFlags;
  readonly eventBus: EventBus<InvoicingEventMap>;
  readonly outbox: Outbox;
  readonly db: Database;

  // Domain ports
  readonly clientRepo: ClientRepository;
  readonly invoiceRepo: InvoiceRepository;
  readonly revenueReadModel: RevenueReadModel;
  readonly pdfGenerator: PdfGenerator;
  readonly notifications: NotificationSender;

  // Bundled query callers for the RSC layer
  readonly queries: {
    readonly clients: {
      getClient(id: ClientId): Client | null;
      listClients(): readonly Client[];
    };
    readonly invoicing: {
      getInvoiceSummary(id: InvoiceId): InvoiceSummary | null;
      getInvoiceLineItems(id: InvoiceId): readonly LineItemSummary[] | null;
      getInvoicePayments(id: InvoiceId): readonly PaymentSummary[] | null;
      listInvoices(filters?: { status?: InvoiceStatus; clientId?: ClientId }): readonly InvoiceSummary[];
      getOutstandingByClient(clientId: ClientId): Money;
    };
    readonly reporting: {
      getRevenueByMonth(month: YearMonth): MonthlyRevenue | null;
      getRevenueByYear(year: number): readonly MonthlyRevenue[];
      listAllRevenue(): readonly MonthlyRevenue[];
    };
  };

  // Combined unsubscribe for cleanup/test control
  readonly unsubscribe: () => void;
}

/**
 * Narrow read-only view for RSC pages. Only exposes queries, feature flags,
 * and clock — no repos, event bus, or infrastructure. This is the type
 * exported from `app.ts` so pages cannot bypass the query layer.
 */
export type AppReadView = Pick<AppDeps, 'queries' | 'featureFlags' | 'clock'>;
