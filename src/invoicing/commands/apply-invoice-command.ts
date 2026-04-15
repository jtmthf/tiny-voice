import type { Result } from 'neverthrow';
import { err, ok } from 'neverthrow';
import type { InvoiceId } from '@/shared/ids/invoice-id';
import type { Database } from '@/shared/db/database';
import type { EventBus } from '@/shared/events/event-bus';
import type { Outbox } from '@/shared/events/outbox';
import type { Invoice } from '../entities/invoice';
import type { InvoiceError } from '../errors/invoice-error';
import { InvoiceError as IE } from '../errors/invoice-error';
import type { InvoiceRepository } from '../ports/invoice-repository';
import type { InvoicingEventMap } from '../events/invoicing-event-map';

export interface ApplyInvoiceCommandDeps {
  readonly db: Database;
  readonly repo: InvoiceRepository;
  readonly outbox: Outbox<InvoicingEventMap>;
  readonly eventBus: EventBus<InvoicingEventMap>;
}

export interface ApplyInvoiceCommandInput<K extends keyof InvoicingEventMap> {
  readonly invoiceId: InvoiceId;
  readonly transition: (invoice: Invoice) => Result<Invoice, InvoiceError>;
  /** Produces the event to enqueue given the updated invoice. Omit for commands that don't emit events. */
  readonly emit?: {
    readonly eventName: K;
    readonly payload: (updated: Invoice) => InvoicingEventMap[K];
  };
}

export async function applyInvoiceCommand<K extends keyof InvoicingEventMap>(
  deps: ApplyInvoiceCommandDeps,
  input: ApplyInvoiceCommandInput<K>,
): Promise<Result<Invoice, InvoiceError>> {
  const invoice = deps.repo.findById(input.invoiceId);
  if (!invoice) return err(IE.invalidInput(`Invoice ${input.invoiceId} not found`));

  const transitionResult = input.transition(invoice);
  if (transitionResult.isErr()) return transitionResult;

  const updated = transitionResult.value;

  const txResult = deps.db.transaction((): Result<void, InvoiceError> => {
    const saveResult = deps.repo.save(updated);
    if (saveResult.isErr()) return saveResult;
    if (input.emit) {
      deps.outbox.enqueue(input.emit.eventName, input.emit.payload(updated));
    }
    return ok(undefined);
  });

  if (txResult.isErr()) return err(txResult.error);

  if (input.emit) {
    await deps.outbox.drain((eventName, payload) => deps.eventBus.publish(eventName, payload));
  }

  return ok(updated);
}
