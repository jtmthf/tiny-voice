import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod/v4';
import { getAppInstance } from '@/app/instance';
import { sendInvoice } from '@/invoicing/commands/send-invoice';
import { InvoiceIdSchema } from '@/shared/ids/invoice-id';
import { invoiceErrorMessage } from '@/app/lib/error-messages';

export const SendInvoiceInput = z.object({ invoiceId: InvoiceIdSchema });
export type SendInvoiceInput = z.infer<typeof SendInvoiceInput>;

export function parseSendInvoiceInput(data: unknown): SendInvoiceInput {
  const raw = data instanceof FormData ? Object.fromEntries(data.entries()) : data;
  return SendInvoiceInput.parse(raw);
}

export async function sendInvoiceHandler(data: SendInvoiceInput): Promise<{ error: string | null }> {
  const app = getAppInstance();
  const result = await sendInvoice(
    { db: app.db, repo: app.invoiceRepo, outbox: app.outbox, clock: app.clock, eventBus: app.eventBus },
    { invoiceId: data.invoiceId },
  );
  if (result.isErr()) return { error: invoiceErrorMessage(result.error) };
  return { error: null };
}

export const sendInvoiceFn = createServerFn({ method: 'POST' })
  .inputValidator(parseSendInvoiceInput)
  .handler(({ data }) => sendInvoiceHandler(data));
