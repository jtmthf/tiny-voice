import { z } from 'zod/v4';
import { InvoiceIdSchema } from '@/shared/ids/invoice-id';
import { ClientIdSchema } from '@/shared/ids/client-id';
import { LineItemIdSchema } from '@/shared/ids/line-item-id';
import { DueDateSchema } from '@/shared/time/due-date';
import type { Clock } from '@/shared/time/clock';
import type { Result } from 'neverthrow';
import { ok, err } from 'neverthrow';
import { Money } from '@/shared/money/money';
import { TaxRateSchema } from '../value-objects/tax-rate';
import type { Invoice } from '../entities/invoice';
import { createInvoice as createInvoicePure, addLineItem as addLineItemPure } from '../entities/invoice';
import type { InvoiceError } from '../errors/invoice-error';
import type { InvoiceRepository } from '../ports/invoice-repository';

export const CreateInvoiceInputSchema = z.object({
  id: InvoiceIdSchema,
  clientId: ClientIdSchema,
  taxRate: TaxRateSchema,
  dueDate: DueDateSchema,
  lineItems: z.array(z.object({
    id: LineItemIdSchema,
    description: z.string().min(1),
    quantity: z.number().int().min(1),
    unitPriceCents: z.bigint().refine((v) => v > 0n, 'Unit price must be positive'),
  })),
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
  let invoice: Invoice = createInvoicePure({
    id: input.id,
    clientId: input.clientId,
    taxRate: input.taxRate,
    dueDate: input.dueDate,
    createdAt: deps.clock.now(),
  });

  for (const li of input.lineItems) {
    const itemResult = addLineItemPure(invoice, {
      id: li.id,
      description: li.description,
      quantity: li.quantity,
      unitPrice: Money.fromCents(li.unitPriceCents),
      kind: 'regular',
    });
    if (itemResult.isErr()) return err(itemResult.error);
    invoice = itemResult.value;
  }

  const saveResult = deps.repo.save(invoice);
  if (saveResult.isErr()) return err(saveResult.error);

  return ok(invoice);
}
