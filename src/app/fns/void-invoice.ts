import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod/v4';
import { getAppInstance } from '@/app/instance';
import { voidInvoice } from '@/invoicing/commands/void-invoice';
import { InvoiceIdSchema } from '@/shared/ids/invoice-id';
import { invoiceErrorMessage } from '@/app/lib/error-messages';

export const VoidInvoiceInput = z.object({ invoiceId: InvoiceIdSchema });
export type VoidInvoiceInput = z.infer<typeof VoidInvoiceInput>;

export function parseVoidInvoiceInput(data: unknown): VoidInvoiceInput {
  const raw = data instanceof FormData ? Object.fromEntries(data.entries()) : data;
  return VoidInvoiceInput.parse(raw);
}

export async function voidInvoiceHandler(data: VoidInvoiceInput): Promise<{ error: string | null }> {
  const app = getAppInstance();
  const result = await voidInvoice(
    { db: app.db, repo: app.invoiceRepo, outbox: app.outbox, clock: app.clock, eventBus: app.eventBus },
    { invoiceId: data.invoiceId },
  );
  if (result.isErr()) return { error: invoiceErrorMessage(result.error) };
  return { error: null };
}

export const voidInvoiceFn = createServerFn({ method: 'POST' })
  .inputValidator(parseVoidInvoiceInput)
  .handler(({ data }) => voidInvoiceHandler(data));
