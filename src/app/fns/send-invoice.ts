import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod/v4';
import { getAppInstance } from '@/app/instance';
import { applyInvoiceCommand } from '@/invoicing/commands/apply-invoice-command';
import { sendInvoice } from '@/invoicing/entities/invoice';
import { InvoiceIdSchema } from '@/shared/ids/invoice-id';
import { invoiceErrorMessage } from '@/app/lib/error-messages';

export const SendInvoiceInput = z.object({ invoiceId: InvoiceIdSchema });
export type SendInvoiceInput = z.infer<typeof SendInvoiceInput>;

export function parseSendInvoiceInput(data: unknown): SendInvoiceInput {
  const raw = data instanceof FormData ? Object.fromEntries(data.entries()) : data;
  return SendInvoiceInput.parse(raw);
}

export async function sendInvoiceHandler(
  data: SendInvoiceInput,
): Promise<{ error: string | null }> {
  const app = getAppInstance();
  const result = await applyInvoiceCommand(
    {
      db: app.db,
      repo: app.invoiceRepo,
      outbox: app.outbox,
      eventBus: app.eventBus,
      logger: app.logger,
    },
    { invoiceId: data.invoiceId },
    (invoice) => sendInvoice(invoice, app.clock.now()),
  );
  if (result.isErr()) return { error: invoiceErrorMessage(result.error) };
  return { error: null };
}

export const sendInvoiceFn = createServerFn({ method: 'POST' })
  .validator(parseSendInvoiceInput)
  .handler(({ data }) => sendInvoiceHandler(data));
