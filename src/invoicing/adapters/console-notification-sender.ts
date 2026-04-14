import type { Logger } from '@/shared/logger/logger';
import type { Result } from '@/shared/result/result';
import { ok } from '@/shared/result/result';
import type {
  NotificationSender,
  NotificationError,
  InvoiceSentNotification,
  PaymentReceivedNotification,
} from '../ports/notification-sender';

export class ConsoleNotificationSender implements NotificationSender {
  constructor(private readonly logger: Logger) {}

  async sendInvoiceSent(input: InvoiceSentNotification): Promise<Result<void, NotificationError>> {
    this.logger.info('Invoice sent notification', {
      invoiceId: input.invoiceId,
      clientName: input.clientName,
      totalCents: input.totalCents.toString(),
    });
    return ok(undefined);
  }

  async sendPaymentReceived(input: PaymentReceivedNotification): Promise<Result<void, NotificationError>> {
    this.logger.info('Payment received notification', {
      invoiceId: input.invoiceId,
      amountCents: input.amountCents.toString(),
      outstandingCents: input.outstanding.cents.toString(),
    });
    return ok(undefined);
  }
}
