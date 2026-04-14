import { z } from 'zod/v4';
import { InvoiceIdSchema } from '@/shared/ids/invoice-id';
import type { Database } from '@/shared/db/database';
import type { Clock } from '@/shared/time/clock';
import type { EventBus } from '@/shared/events/event-bus';
import type { Outbox } from '@/shared/events/outbox';
import type { Result } from '@/shared/result/result';
import { err } from '@/shared/result/result';
import type { Invoice } from '../entities/invoice';
import { sendInvoice as sendInvoicePure, total } from '../entities/invoice';
import type { InvoiceError } from '../errors/invoice-error';
import { InvoiceError as IE } from '../errors/invoice-error';
import type { InvoiceRepository } from '../ports/invoice-repository';
import type { InvoicingEventMap } from '../events/invoicing-event-map';

export const SendInvoiceInputSchema = z.object({
  invoiceId: InvoiceIdSchema,
});

export type SendInvoiceInput = z.infer<typeof SendInvoiceInputSchema>;

export interface SendInvoiceDeps {
  readonly db: Database;
  readonly repo: InvoiceRepository;
  readonly outbox: Outbox;
  readonly clock: Clock;
  readonly eventBus: EventBus<InvoicingEventMap>;
}

export async function sendInvoice(
  deps: SendInvoiceDeps,
  input: SendInvoiceInput,
): Promise<Result<Invoice, InvoiceError>> {
  const invoice = deps.repo.findById(input.invoiceId);
  if (!invoice) return err(IE.invalidInput(`Invoice ${input.invoiceId} not found`));

  const result = sendInvoicePure(invoice);
  if (result.isErr()) return result;

  const updated = result.value;
  const txResult = deps.db.transaction(() => {
    const saveResult = deps.repo.save(updated);
    if (saveResult.isErr()) return saveResult;

    deps.outbox.enqueue('InvoiceSent', {
      invoiceId: updated.id,
      clientId: updated.clientId,
      totalCents: total(updated).cents,
      sentAt: deps.clock.now(),
    });

    return saveResult;
  });

  if (txResult.isErr()) return err(txResult.error);

  await deps.outbox.drain((event, payload) =>
    deps.eventBus.publish(event as keyof InvoicingEventMap & string, payload as InvoicingEventMap[keyof InvoicingEventMap]),
  );

  return result;
}
