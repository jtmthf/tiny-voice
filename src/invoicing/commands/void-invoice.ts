import { z } from 'zod/v4';
import { InvoiceIdSchema } from '@/shared/ids/invoice-id';
import type { Clock } from '@/shared/time/clock';
import type { Result } from 'neverthrow';
import type { Invoice } from '../entities/invoice';
import { voidInvoice as voidInvoicePure } from '../entities/invoice';
import type { InvoiceError } from '../errors/invoice-error';
import type { ApplyInvoiceCommandDeps } from './apply-invoice-command';
import { applyInvoiceCommand } from './apply-invoice-command';

export const VoidInvoiceInputSchema = z.object({
  invoiceId: InvoiceIdSchema,
});

export type VoidInvoiceInput = z.infer<typeof VoidInvoiceInputSchema>;

export interface VoidInvoiceDeps extends ApplyInvoiceCommandDeps {
  readonly clock: Clock;
}

export async function voidInvoice(
  deps: VoidInvoiceDeps,
  input: VoidInvoiceInput,
): Promise<Result<Invoice, InvoiceError>> {
  return applyInvoiceCommand(deps, {
    invoiceId: input.invoiceId,
    transition: voidInvoicePure,
    emit: {
      eventName: 'InvoiceVoided',
      payload: () => ({
        invoiceId: input.invoiceId,
        voidedAt: deps.clock.now().toISOString(),
      }),
    },
  });
}
