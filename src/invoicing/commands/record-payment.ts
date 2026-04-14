import { z } from 'zod/v4';
import { InvoiceIdSchema } from '@/shared/ids/invoice-id';
import { PaymentIdSchema } from '@/shared/ids/payment-id';
import type { Database } from '@/shared/db/database';
import type { Clock } from '@/shared/time/clock';
import type { EventBus } from '@/shared/events/event-bus';
import type { Outbox } from '@/shared/events/outbox';
import type { Result } from '@/shared/result/result';
import { err } from '@/shared/result/result';
import { Money } from '@/shared/money/money';
import type { Invoice } from '../entities/invoice';
import { recordPayment as recordPaymentPure } from '../entities/invoice';
import type { InvoiceError } from '../errors/invoice-error';
import { InvoiceError as IE } from '../errors/invoice-error';
import type { InvoiceRepository } from '../ports/invoice-repository';
import type { InvoicingEventMap } from '../events/invoicing-event-map';

export const RecordPaymentInputSchema = z.object({
  invoiceId: InvoiceIdSchema,
  paymentId: PaymentIdSchema,
  amountCents: z.bigint().refine((v) => v > 0n, 'Payment amount must be positive'),
});

export type RecordPaymentInput = z.infer<typeof RecordPaymentInputSchema>;

export interface RecordPaymentDeps {
  readonly db: Database;
  readonly repo: InvoiceRepository;
  readonly outbox: Outbox;
  readonly clock: Clock;
  readonly eventBus: EventBus<InvoicingEventMap>;
}

export async function recordPayment(
  deps: RecordPaymentDeps,
  input: RecordPaymentInput,
): Promise<Result<Invoice, InvoiceError>> {
  const invoice = deps.repo.findById(input.invoiceId);
  if (!invoice) return err(IE.invalidInput(`Invoice ${input.invoiceId} not found`));

  const now = deps.clock.now();
  const result = recordPaymentPure(invoice, {
    id: input.paymentId,
    amount: Money.fromCents(input.amountCents),
    recordedAt: now,
  });

  if (result.isErr()) return result;

  const updated = result.value;
  const txResult = deps.db.transaction(() => {
    const saveResult = deps.repo.save(updated);
    if (saveResult.isErr()) return saveResult;

    deps.outbox.enqueue('InvoicePaymentRecorded', {
      invoiceId: updated.id,
      paymentId: input.paymentId,
      amountCents: input.amountCents,
      becamePaid: updated.status === 'paid',
      recordedAt: now,
    });

    return saveResult;
  });

  if (txResult.isErr()) return err(txResult.error);

  await deps.outbox.drain((event, payload) =>
    deps.eventBus.publish(event as keyof InvoicingEventMap & string, payload as InvoicingEventMap[keyof InvoicingEventMap]),
  );

  return result;
}
