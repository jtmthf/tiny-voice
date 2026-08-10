import { createServerFn } from '@tanstack/react-start';
import { redirect } from '@tanstack/react-router';
import { z } from 'zod';
import { getAppInstance } from '@/app/instance';
import { createInvoice } from '@/invoicing/commands/create-invoice';
import { newInvoiceId } from '@/shared/ids/invoice-id';
import { newLineItemId } from '@/shared/ids/line-item-id';
import { ClientIdSchema } from '@/shared/ids/client-id';
import { TaxRateSchema } from '@/invoicing/value-objects/tax-rate';
import { DueDateSchema } from '@/shared/time/due-date';
import { invoiceErrorMessage } from '@/app/lib/error-messages';
import { parseBracketNotation } from './parse-bracket-notation';

export const CreateInvoiceInput = z.object({
  clientId: ClientIdSchema,
  taxRate: z.coerce
    .number()
    .transform((v) => v / 100)
    .pipe(TaxRateSchema),
  dueDate: DueDateSchema,
  lineItems: z
    .array(
      z.object({
        description: z.string().min(1, 'Description is required'),
        quantity: z.coerce.number().int().min(1),
        unitPriceCents: z.string().regex(/^[1-9]\d*$/, 'Price must be a positive integer'),
      }),
    )
    .min(1, 'At least one line item is required'),
});

export type CreateInvoiceInput = z.infer<typeof CreateInvoiceInput>;

export function parseCreateInvoiceInput(data: unknown): CreateInvoiceInput {
  const raw = data instanceof FormData ? parseBracketNotation(data) : data;
  return CreateInvoiceInput.parse(raw);
}

export function createInvoiceHandler(data: CreateInvoiceInput): Promise<never> {
  const app = getAppInstance();

  const client = app.queries.clients.getClient(data.clientId);
  if (!client) return Promise.reject(new Error('Client not found'));

  const result = createInvoice(
    { repo: app.invoiceRepo, clock: app.clock },
    {
      id: newInvoiceId(),
      clientId: data.clientId,
      taxRate: data.taxRate,
      dueDate: data.dueDate,
      lineItems: data.lineItems.map((li) => ({
        id: newLineItemId(),
        description: li.description,
        quantity: li.quantity,
        unitPriceCents: BigInt(li.unitPriceCents),
      })),
    },
  );
  if (result.isErr()) return Promise.reject(new Error(invoiceErrorMessage(result.error)));
  // redirect() is TanStack Router's documented control-flow signal, not an Error.
  // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
  return Promise.reject(redirect({ to: '/invoices/$id', params: { id: result.value.id } }));
}

export const createInvoiceFn = createServerFn({ method: 'POST' })
  .validator(parseCreateInvoiceInput)
  .handler(({ data }) => createInvoiceHandler(data));
