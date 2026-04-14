import type { PaymentId } from '@/shared/ids/payment-id';
import type { Money } from '@/shared/money/money';

export interface Payment {
  readonly id: PaymentId;
  readonly amount: Money;
  readonly recordedAt: Date;
}
