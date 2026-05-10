import type { EventBus } from '@/shared/events/event-bus';
import type { Clock } from '@/shared/time/clock';
import type { Logger } from '@/shared/logger/logger';
import type { ClientId } from '@/shared/ids/client-id';
import { Money } from '@/shared/money/money';
import type { InvoicingEventMap } from '@/invoicing/events/invoicing-event-map';
import type { NotificationSender } from '@/invoicing/ports/notification-sender';
import type { InvoiceRepository } from '@/invoicing/ports/invoice-repository';
import { outstandingBalance } from '@/invoicing/entities/invoice';
import type { Client } from '@/clients/entities/client';

export interface RegisterNotificationSubscribersDeps {
  readonly eventBus: EventBus<InvoicingEventMap>;
  readonly notifications: NotificationSender;
  readonly invoiceRepo: InvoiceRepository;
  readonly getClient: (id: ClientId) => Client | null;
  readonly clock: Clock;
  readonly logger: Logger;
}

export function registerNotificationSubscribers(
  deps: RegisterNotificationSubscribersDeps,
): () => void {
  const unsubs: (() => void)[] = [];

  unsubs.push(
    deps.eventBus.subscribe('InvoiceSent', async (payload) => {
      const client = deps.getClient(payload.clientId);
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
