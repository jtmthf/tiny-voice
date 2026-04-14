import { z } from 'zod/v4';
import { InvoiceIdSchema } from '@/shared/ids/invoice-id';
import { LineItemIdSchema } from '@/shared/ids/line-item-id';
import type { Result } from '@/shared/result/result';
import { err } from '@/shared/result/result';
import { Money } from '@/shared/money/money';
import type { Invoice } from '../entities/invoice';
import { addLineItem as addLineItemPure } from '../entities/invoice';
import type { InvoiceError } from '../errors/invoice-error';
import { InvoiceError as IE } from '../errors/invoice-error';
import type { InvoiceRepository } from '../ports/invoice-repository';

export const AddLineItemInputSchema = z.object({
  invoiceId: InvoiceIdSchema,
  lineItemId: LineItemIdSchema,
  description: z.string().min(1),
  quantity: z.number().int().min(1),
  unitPriceCents: z.bigint().refine((v) => v > 0n, 'Unit price must be positive'),
});

export type AddLineItemInput = z.infer<typeof AddLineItemInputSchema>;

export interface AddLineItemDeps {
  readonly repo: InvoiceRepository;
}

export function addLineItem(
  deps: AddLineItemDeps,
  input: AddLineItemInput,
): Result<Invoice, InvoiceError> {
  const invoice = deps.repo.findById(input.invoiceId);
  if (!invoice) return err(IE.invalidInput(`Invoice ${input.invoiceId} not found`));

  const result = addLineItemPure(invoice, {
    id: input.lineItemId,
    description: input.description,
    quantity: input.quantity,
    unitPrice: Money.fromCents(input.unitPriceCents),
  });

  if (result.isErr()) return result;

  const updated = result.value;
  const saveResult = deps.repo.save(updated);
  if (saveResult.isErr()) return saveResult.map(() => updated);

  return result;
}
