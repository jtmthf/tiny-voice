import type { Result } from '@/shared/result/result';
import type { InvoiceId } from '@/shared/ids/invoice-id';
import type { Money } from '@/shared/money/money';

export interface NotificationError { readonly kind: 'NotificationFailed'; readonly reason: string }

export interface InvoiceSentNotification {
  readonly invoiceId: InvoiceId;
  readonly clientName: string;
  readonly totalCents: bigint;
}

export interface PaymentReceivedNotification {
  readonly invoiceId: InvoiceId;
  readonly amountCents: bigint;
  readonly outstanding: Money;
}

export interface NotificationSender {
  sendInvoiceSent(input: InvoiceSentNotification): Promise<Result<void, NotificationError>>;
  sendPaymentReceived(input: PaymentReceivedNotification): Promise<Result<void, NotificationError>>;
}
