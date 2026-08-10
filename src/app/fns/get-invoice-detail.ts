import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
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
  .validator((data: unknown) => Input.parse(data))
  .handler(({ data }): InvoiceDetailDto => {
    const app = getAppReadView();
    const detail = app.queries.invoicing.getInvoiceDetail(data.invoiceId);

    let clientName: string | null = null;
    if (detail) {
      const client = app.queries.clients.getClient(detail.summary.clientId);
      clientName = client?.name ?? null;
    }

    return {
      summary: detail ? invoiceSummaryToDto(detail.summary) : null,
      lineItems: detail ? detail.lineItems.map(lineItemToDto) : null,
      payments: detail ? detail.payments.map(paymentToDto) : null,
      clientName,
    };
  });
