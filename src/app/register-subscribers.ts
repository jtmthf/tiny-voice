import type { EventBus } from '@/shared/events/event-bus';
import type { Clock } from '@/shared/time/clock';
import type { Logger } from '@/shared/logger/logger';
import { Money } from '@/shared/money/money';
import type { InvoicingEventMap } from '@/invoicing/events/invoicing-event-map';
import type { NotificationSender } from '@/invoicing/ports/notification-sender';
import type { InvoiceRepository } from '@/invoicing/ports/invoice-repository';
import { outstandingBalance } from '@/invoicing/entities/invoice';
import type { ClientRepository } from '@/clients/ports/client-repository';
import type { RevenueReadModel } from '@/reporting/ports/revenue-read-model';
import { registerRevenueProjection } from '@/reporting/projections/register-revenue-projection';

export interface RegisterSubscribersDeps {
  readonly eventBus: EventBus<InvoicingEventMap>;
  readonly revenueReadModel: RevenueReadModel;
  readonly notifications: NotificationSender;
  readonly invoiceRepo: InvoiceRepository;
  readonly clientRepo: ClientRepository;
  readonly logger: Logger;
  readonly clock: Clock;
}

/**
 * Registers all event subscribers and returns a combined unsubscribe function.
 *
 * Two subscriber groups:
 * 1. Revenue projection — InvoicePaymentRecorded -> update read model
 * 2. Notifications — InvoiceSent -> notify; InvoicePaymentRecorded -> notify
 *
 * Cache invalidation is handled by Server Actions via `updateTag` from next/cache.
 */
export function registerSubscribers(deps: RegisterSubscribersDeps): () => void {
  const unsubs: (() => void)[] = [];

  // 1. Revenue projection (delegated to reporting module)
  unsubs.push(
    registerRevenueProjection({
      eventBus: deps.eventBus,
      readModel: deps.revenueReadModel,
      logger: deps.logger,
    }),
  );

  // 2. Notifications
  unsubs.push(
    deps.eventBus.subscribe('InvoiceSent', async (payload) => {
      // Look up client name for the notification
      const client = deps.clientRepo.findById(payload.clientId);
      if (!client) {
        deps.logger.warn('notification.client_not_found', { clientId: payload.clientId });
      }
      const clientName = client?.name ?? 'Unknown Client';

      await deps.notifications.sendInvoiceSent({
        invoiceId: payload.invoiceId,
        clientName,
        totalCents: BigInt(payload.totalCents),
      });
      deps.logger.info('notification.invoice_sent', { invoiceId: payload.invoiceId });
    }),
  );

  unsubs.push(
    deps.eventBus.subscribe('InvoicePaymentRecorded', async (payload) => {
      // Need outstanding balance for the notification
      const invoice = deps.invoiceRepo.findById(payload.invoiceId);
      const outstanding = invoice ? outstandingBalance(invoice) : Money.zero();

      await deps.notifications.sendPaymentReceived({
        invoiceId: payload.invoiceId,
        amountCents: BigInt(payload.amountCents),
        outstanding,
      });
      deps.logger.info('notification.payment_received', { invoiceId: payload.invoiceId });
    }),
  );

  return () => {
    for (const unsub of unsubs) {
      unsub();
    }
  };
}
