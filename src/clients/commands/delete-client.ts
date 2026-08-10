import type { Result } from 'neverthrow';
import { ok, err } from 'neverthrow';
import type { ClientId } from '@/shared/ids/client-id';
import type { ClientRepository } from '../ports/client-repository';
import type { InvoiceRepository } from '@/invoicing/ports/invoice-repository';

export interface DeleteClientError {
  readonly kind: 'NotFound';
}

/**
 * Command handler: deletes a client and cascades deletion of all their invoices.
 */
export function deleteClient(
  deps: { clientRepo: ClientRepository; invoiceRepo: InvoiceRepository },
  input: { clientId: ClientId },
): Result<void, DeleteClientError> {
  const client = deps.clientRepo.findById(input.clientId);
  if (!client) {
    return err({ kind: 'NotFound' } as const);
  }

  const invoices = deps.invoiceRepo.list({ clientId: input.clientId });
  for (const invoice of invoices) {
    deps.invoiceRepo.delete(invoice.id);
  }

  deps.clientRepo.delete(input.clientId);
  return ok(undefined);
}
