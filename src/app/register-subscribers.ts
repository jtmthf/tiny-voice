import type { EventBus } from '@/shared/events/event-bus';
import type { Clock } from '@/shared/time/clock';
import type { Logger } from '@/shared/logger/logger';
import type { ClientId } from '@/shared/ids/client-id';
import type { Client } from '@/clients/entities/client';
import type { InvoicingEventMap } from '@/invoicing/events/invoicing-event-map';
import type { NotificationSender } from '@/invoicing/ports/notification-sender';
import type { InvoiceRepository } from '@/invoicing/ports/invoice-repository';
import { registerNotificationSubscribers } from '@/invoicing/subscribers/register-notification-subscribers';
import type { RevenueReadModel } from '@/reporting/ports/revenue-read-model';
import { registerRevenueProjection } from '@/reporting/projections/register-revenue-projection';

export interface RegisterSubscribersDeps {
  readonly eventBus: EventBus<InvoicingEventMap>;
  readonly revenueReadModel: RevenueReadModel;
  readonly notifications: NotificationSender;
  readonly invoiceRepo: InvoiceRepository;
  readonly getClient: (id: ClientId) => Client | null;
  readonly logger: Logger;
  readonly clock: Clock;
}

export function registerSubscribers(deps: RegisterSubscribersDeps): () => void {
  const unsubs: (() => void)[] = [];

  unsubs.push(
    registerRevenueProjection({
      eventBus: deps.eventBus,
      readModel: deps.revenueReadModel,
      logger: deps.logger,
    }),
  );

  unsubs.push(
    registerNotificationSubscribers({
      eventBus: deps.eventBus,
      notifications: deps.notifications,
      invoiceRepo: deps.invoiceRepo,
      getClient: deps.getClient,
      clock: deps.clock,
      logger: deps.logger,
    }),
  );

  return () => {
    for (const unsub of unsubs) {
      unsub();
    }
  };
}
