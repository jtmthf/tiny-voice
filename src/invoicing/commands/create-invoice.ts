import { z } from 'zod/v4';
import { InvoiceIdSchema } from '@/shared/ids/invoice-id';
import { ClientIdSchema } from '@/shared/ids/client-id';
import { DueDateSchema } from '@/shared/time/due-date';
import type { Clock } from '@/shared/time/clock';
import type { Result } from '@/shared/result/result';
import { err } from '@/shared/result/result';
import { TaxRateSchema } from '../value-objects/tax-rate';
import type { Invoice } from '../entities/invoice';
import { createInvoice as createInvoicePure } from '../entities/invoice';
import type { InvoiceError } from '../errors/invoice-error';
import type { InvoiceRepository } from '../ports/invoice-repository';

export const CreateInvoiceInputSchema = z.object({
  id: InvoiceIdSchema,
  clientId: ClientIdSchema,
  taxRate: TaxRateSchema,
  dueDate: DueDateSchema,
});

export type CreateInvoiceInput = z.infer<typeof CreateInvoiceInputSchema>;

export interface CreateInvoiceDeps {
  readonly repo: InvoiceRepository;
  readonly clock: Clock;
}

export function createInvoice(
  deps: CreateInvoiceDeps,
  input: CreateInvoiceInput,
): Result<Invoice, InvoiceError> {
  const result = createInvoicePure({
    id: input.id,
    clientId: input.clientId,
    taxRate: input.taxRate,
    dueDate: input.dueDate,
    createdAt: deps.clock.now(),
  });

  if (result.isErr()) return result;

  const invoice = result.value;
  const saveResult = deps.repo.save(invoice);
  if (saveResult.isErr()) return err(saveResult.error);

  return result;
}
