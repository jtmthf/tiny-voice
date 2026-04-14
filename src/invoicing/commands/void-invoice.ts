import { z } from 'zod/v4';
import { InvoiceIdSchema } from '@/shared/ids/invoice-id';
import type { Database } from '@/shared/db/database';
import type { Clock } from '@/shared/time/clock';
import type { EventBus } from '@/shared/events/event-bus';
import type { Outbox } from '@/shared/events/outbox';
import type { Result } from 'neverthrow';
import { err } from 'neverthrow';
import type { Invoice } from '../entities/invoice';
import { voidInvoice as voidInvoicePure } from '../entities/invoice';
import type { InvoiceError } from '../errors/invoice-error';
import { InvoiceError as IE } from '../errors/invoice-error';
import type { InvoiceRepository } from '../ports/invoice-repository';
import type { InvoicingEventMap } from '../events/invoicing-event-map';

export const VoidInvoiceInputSchema = z.object({
  invoiceId: InvoiceIdSchema,
});

export type VoidInvoiceInput = z.infer<typeof VoidInvoiceInputSchema>;

export interface VoidInvoiceDeps {
  readonly db: Database;
  readonly repo: InvoiceRepository;
  readonly outbox: Outbox;
  readonly clock: Clock;
  readonly eventBus: EventBus<InvoicingEventMap>;
}

export async function voidInvoice(
  deps: VoidInvoiceDeps,
  input: VoidInvoiceInput,
): Promise<Result<Invoice, InvoiceError>> {
  const invoice = deps.repo.findById(input.invoiceId);
  if (!invoice) return err(IE.invalidInput(`Invoice ${input.invoiceId} not found`));

  const result = voidInvoicePure(invoice);
  if (result.isErr()) return result;

  const updated = result.value;
  const txResult = deps.db.transaction(() => {
    const saveResult = deps.repo.save(updated);
    if (saveResult.isErr()) return saveResult;

    deps.outbox.enqueue('InvoiceVoided', {
      invoiceId: updated.id,
      voidedAt: deps.clock.now().toISOString(),
    });

    return saveResult;
  });

  if (txResult.isErr()) return err(txResult.error);

  await deps.outbox.drain((event, payload) =>
    deps.eventBus.publish(event as keyof InvoicingEventMap & string, payload as InvoicingEventMap[keyof InvoicingEventMap]),
  );

  return result;
}
