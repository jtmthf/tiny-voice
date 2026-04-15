import type { Database } from '@/shared/db/database';
import type { Clock } from '@/shared/time/clock';
import type { Logger } from '@/shared/logger/logger';
import type { FeatureFlags } from '@/shared/flags/feature-flags';
import type { Outbox } from '@/shared/events/outbox';
import type { ClientRepository } from '@/clients/ports/client-repository';
import type { InvoiceRepository } from '@/invoicing/ports/invoice-repository';
import type { PdfGenerator } from '@/invoicing/ports/pdf-generator';
import type { NotificationSender } from '@/invoicing/ports/notification-sender';
import type { EventBus } from '@/shared/events/event-bus';
import type { InvoicingEventMap } from '@/invoicing/events/invoicing-event-map';

export interface RpcContext {
  readonly db: Database;
  readonly clientRepo: ClientRepository;
  readonly invoiceRepo: InvoiceRepository;
  readonly pdfGenerator: PdfGenerator;
  readonly notifications: NotificationSender;
  readonly outbox: Outbox<InvoicingEventMap>;
  readonly eventBus: EventBus<InvoicingEventMap>;
  readonly clock: Clock;
  readonly logger: Logger;
  readonly featureFlags: FeatureFlags;
}
