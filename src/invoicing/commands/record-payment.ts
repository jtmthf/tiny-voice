import { z } from 'zod/v4';
import { InvoiceIdSchema } from '@/shared/ids/invoice-id';
import { PaymentIdSchema } from '@/shared/ids/payment-id';
import type { Clock } from '@/shared/time/clock';
import type { Result } from 'neverthrow';
import { Money } from '@/shared/money/money';
import type { Invoice } from '../entities/invoice';
import { recordPayment as recordPaymentPure } from '../entities/invoice';
import type { InvoiceError } from '../errors/invoice-error';
import type { ApplyInvoiceCommandDeps } from './apply-invoice-command';
import { applyInvoiceCommand } from './apply-invoice-command';

export const RecordPaymentInputSchema = z.object({
  invoiceId: InvoiceIdSchema,
  paymentId: PaymentIdSchema,
  amountCents: z.bigint().refine((v) => v > 0n, 'Payment amount must be positive'),
});

export type RecordPaymentInput = z.infer<typeof RecordPaymentInputSchema>;

export interface RecordPaymentDeps extends ApplyInvoiceCommandDeps {
  readonly clock: Clock;
}

export async function recordPayment(
  deps: RecordPaymentDeps,
  input: RecordPaymentInput,
): Promise<Result<Invoice, InvoiceError>> {
  const now = deps.clock.now();
  const payment = {
    id: input.paymentId,
    amount: Money.fromCents(input.amountCents),
    recordedAt: now,
  };

  return applyInvoiceCommand(deps, {
    invoiceId: input.invoiceId,
    transition: (invoice) => recordPaymentPure(invoice, payment),
    emit: {
      eventName: 'InvoicePaymentRecorded',
      payload: (updated) => ({
        invoiceId: updated.id,
        paymentId: input.paymentId,
        amountCents: input.amountCents.toString(),
        becamePaid: updated.status === 'paid',
        recordedAt: now.toISOString(),
      }),
    },
  });
}
