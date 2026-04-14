import type { Database } from '@/shared/db/database';
import type { Clock } from '@/shared/time/clock';
import type { Logger } from '@/shared/logger/logger';
import type { FeatureFlags } from '@/shared/flags/feature-flags';
import type { Outbox } from '@/shared/events/outbox';
import type { ClientRepository } from '@/clients/index';
import type {
  InvoiceRepository,
  PdfGenerator,
  NotificationSender,
} from '@/invoicing/index';
import type { EventBus } from '@/shared/events/event-bus';
import type { InvoicingEventMap } from '@/invoicing/index';

export interface RpcContext {
  readonly db: Database;
  readonly clientRepo: ClientRepository;
  readonly invoiceRepo: InvoiceRepository;
  readonly pdfGenerator: PdfGenerator;
  readonly notifications: NotificationSender;
  readonly outbox: Outbox;
  readonly eventBus: EventBus<InvoicingEventMap>;
  readonly clock: Clock;
  readonly logger: Logger;
  readonly featureFlags: FeatureFlags;
}
