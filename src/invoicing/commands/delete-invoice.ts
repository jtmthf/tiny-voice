import type { Result } from 'neverthrow';
import { ok, err } from 'neverthrow';
import type { InvoiceId } from '../../shared/ids/invoice-id';
import type { InvoiceRepository } from '../ports/invoice-repository';
import { InvoiceError } from '../errors/invoice-error';
import type { InvoiceError as InvoiceErrorType } from '../errors/invoice-error';

/**
 * Command handler: deletes an invoice and cascades deletion of payments and line items.
 */
export function deleteInvoice(
  deps: { repo: InvoiceRepository },
  input: { invoiceId: InvoiceId },
): Result<void, InvoiceErrorType> {
  const invoice = deps.repo.findById(input.invoiceId);
  if (!invoice) {
    return err(InvoiceError.notFound());
  }

  deps.repo.delete(input.invoiceId);
  return ok(undefined);
}
