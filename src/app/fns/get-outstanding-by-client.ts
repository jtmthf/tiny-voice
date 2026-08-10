import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod/v4';
import { getAppReadView } from '@/app/instance';
import { ClientIdSchema } from '@/shared/ids/client-id';
import type { MoneyDto } from './dto';

const Input = z.object({ clientId: ClientIdSchema });

export const getOutstandingByClientFn = createServerFn({ method: 'GET' })
  .validator((data: unknown) => Input.parse(data))
  .handler(({ data }): MoneyDto => {
    const app = getAppReadView();
    const money = app.queries.invoicing.getOutstandingByClient(data.clientId);
    return { cents: money.cents.toString(), currency: 'USD' };
  });
