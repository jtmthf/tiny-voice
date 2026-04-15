import { z } from 'zod/v4';
import { InvoiceIdSchema } from '@/shared/ids/invoice-id';
import type { Clock } from '@/shared/time/clock';
import type { Result } from 'neverthrow';
import type { Invoice } from '../entities/invoice';
import { sendInvoice as sendInvoicePure, total } from '../entities/invoice';
import type { InvoiceError } from '../errors/invoice-error';
import type { ApplyInvoiceCommandDeps } from './apply-invoice-command';
import { applyInvoiceCommand } from './apply-invoice-command';

export const SendInvoiceInputSchema = z.object({
  invoiceId: InvoiceIdSchema,
});

export type SendInvoiceInput = z.infer<typeof SendInvoiceInputSchema>;

export interface SendInvoiceDeps extends ApplyInvoiceCommandDeps {
  readonly clock: Clock;
}

export async function sendInvoice(
  deps: SendInvoiceDeps,
  input: SendInvoiceInput,
): Promise<Result<Invoice, InvoiceError>> {
  return applyInvoiceCommand(deps, {
    invoiceId: input.invoiceId,
    transition: sendInvoicePure,
    emit: {
      eventName: 'InvoiceSent',
      payload: (updated) => ({
        invoiceId: updated.id,
        clientId: updated.clientId,
        totalCents: total(updated).cents.toString(),
        sentAt: deps.clock.now().toISOString(),
      }),
    },
  });
}
