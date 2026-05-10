import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod/v4';
import { getAppReadView } from '@/app/instance';
import { InvoiceIdSchema } from '@/shared/ids/invoice-id';
import { invoiceSummaryToDto, lineItemToDto, paymentToDto } from './dto';
import type { InvoiceSummaryDto, LineItemDto, PaymentDto } from './dto';

const Input = z.object({ invoiceId: InvoiceIdSchema });

export interface InvoiceDetailDto {
  readonly summary: InvoiceSummaryDto | null;
  readonly lineItems: readonly LineItemDto[] | null;
  readonly payments: readonly PaymentDto[] | null;
  readonly clientName: string | null;
}

export const getInvoiceDetailFn = createServerFn({ method: 'GET' })
  .inputValidator((data: unknown) => Input.parse(data))
  .handler(async ({ data }): Promise<InvoiceDetailDto> => {
    const app = getAppReadView();
    const summary = app.queries.invoicing.getInvoiceSummary(data.invoiceId);
    const lineItems = app.queries.invoicing.getInvoiceLineItems(data.invoiceId);
    const payments = app.queries.invoicing.getInvoicePayments(data.invoiceId);

    let clientName: string | null = null;
    if (summary) {
      const client = app.queries.clients.getClient(summary.clientId);
      clientName = client?.name ?? null;
    }

    return {
      summary: summary ? invoiceSummaryToDto(summary) : null,
      lineItems: lineItems ? lineItems.map(lineItemToDto) : null,
      payments: payments ? payments.map(paymentToDto) : null,
      clientName,
    };
  });
