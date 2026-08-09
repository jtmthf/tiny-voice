import type { Result } from 'neverthrow';
import { err, ok } from 'neverthrow';
import type { InvoiceId } from '@/shared/ids/invoice-id';
import type { Database } from '@/shared/db/database';
import type { EventBus } from '@/shared/events/event-bus';
import type { Outbox } from '@/shared/events/outbox';
import type { Logger } from '@/shared/logger/logger';
import type { Invoice, InvoiceOutcome } from '../entities/invoice';
import type { InvoiceError } from '../errors/invoice-error';
import { InvoiceError as IE } from '../errors/invoice-error';
import type { InvoiceRepository } from '../ports/invoice-repository';
import type { InvoicingEventMap } from '../events/invoicing-event-map';

export interface ApplyInvoiceCommandDeps {
  readonly db: Database;
  readonly repo: InvoiceRepository;
  readonly outbox: Outbox<InvoicingEventMap>;
  readonly eventBus: EventBus<InvoicingEventMap>;
  readonly logger?: Logger;
}

export type InvoiceTransition = (invoice: Invoice) => Result<InvoiceOutcome, InvoiceError>;

export async function applyInvoiceCommand(
  deps: ApplyInvoiceCommandDeps,
  input: { readonly invoiceId: InvoiceId },
  transition: InvoiceTransition,
): Promise<Result<Invoice, InvoiceError>> {
  const invoice = deps.repo.findById(input.invoiceId);
  if (!invoice) return err(IE.invalidInput(`Invoice ${input.invoiceId} not found`));

  const transitionResult = transition(invoice);
  if (transitionResult.isErr()) return err(transitionResult.error);

  const { aggregate, events } = transitionResult.value;

  const txResult = deps.db.transaction((): Result<void, InvoiceError> => {
    const saveResult = deps.repo.save(aggregate);
    if (saveResult.isErr()) return saveResult;
    for (const event of events) {
      deps.outbox.enqueue(event.type, event.payload);
    }
    return ok(undefined);
  });

  if (txResult.isErr()) return err(txResult.error);

  if (events.length > 0) {
    await deps.outbox.drain(
      (eventName, payload) => deps.eventBus.publish(eventName, payload),
      (eventName, error) => deps.logger?.warn('outbox.drain.failed', { eventName, error }),
    );
  }

  return ok(aggregate);
}
