import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod/v4';
import { getAppInstance } from '@/app/instance';
import { recordPayment } from '@/invoicing/commands/record-payment';
import { InvoiceIdSchema } from '@/shared/ids/invoice-id';
import { newPaymentId } from '@/shared/ids/payment-id';
import { invoiceErrorMessage } from '@/app/lib/error-messages';

export const RecordPaymentInput = z.object({
  invoiceId: InvoiceIdSchema,
  amountCents: z.string().regex(/^[1-9]\d*$/, 'Amount must be a positive integer').transform(BigInt),
});
export type RecordPaymentInput = z.infer<typeof RecordPaymentInput>;

export function parseRecordPaymentInput(data: unknown): RecordPaymentInput {
  const raw = data instanceof FormData ? Object.fromEntries(data.entries()) : data;
  return RecordPaymentInput.parse(raw);
}

export async function recordPaymentHandler(data: RecordPaymentInput): Promise<{ error: string | null }> {
  const app = getAppInstance();
  const result = await recordPayment(
    { db: app.db, repo: app.invoiceRepo, outbox: app.outbox, clock: app.clock, eventBus: app.eventBus },
    { invoiceId: data.invoiceId, paymentId: newPaymentId(), amountCents: data.amountCents },
  );
  if (result.isErr()) return { error: invoiceErrorMessage(result.error) };
  return { error: null };
}

export const recordPaymentFn = createServerFn({ method: 'POST' })
  .inputValidator(parseRecordPaymentInput)
  .handler(({ data }) => recordPaymentHandler(data));
