import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod/v4';
import { getAppReadView } from '@/app/instance';
import { ClientIdSchema } from '@/shared/ids/client-id';
import { invoiceSummaryToDto } from './dto';

const Input = z.object({ clientId: ClientIdSchema });

export const getClientInvoicesFn = createServerFn({ method: 'GET' })
  .validator((data: unknown) => Input.parse(data))
  .handler(async ({ data }) => {
    const app = getAppReadView();
    return app.queries.invoicing.listInvoices({ clientId: data.clientId }).map(invoiceSummaryToDto);
  });
