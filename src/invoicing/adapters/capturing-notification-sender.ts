import type { Result } from 'neverthrow';
import { ok } from 'neverthrow';
import type {
  NotificationSender,
  NotificationError,
  InvoiceSentNotification,
  PaymentReceivedNotification,
} from '../ports/notification-sender';

type SentEntry =
  | { readonly type: 'invoiceSent'; readonly input: InvoiceSentNotification }
  | { readonly type: 'paymentReceived'; readonly input: PaymentReceivedNotification };

export class CapturingNotificationSender implements NotificationSender {
  readonly sent: SentEntry[] = [];

  sendInvoiceSent(input: InvoiceSentNotification): Promise<Result<void, NotificationError>> {
    this.sent.push({ type: 'invoiceSent', input });
    return Promise.resolve(ok(undefined));
  }

  sendPaymentReceived(
    input: PaymentReceivedNotification,
  ): Promise<Result<void, NotificationError>> {
    this.sent.push({ type: 'paymentReceived', input });
    return Promise.resolve(ok(undefined));
  }
}
