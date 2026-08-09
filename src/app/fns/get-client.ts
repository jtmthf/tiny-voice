import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod/v4';
import { getAppReadView } from '@/app/instance';
import { ClientIdSchema } from '@/shared/ids/client-id';
import { clientToDto } from './dto';
import type { ClientDto } from './dto';

const Input = z.object({ id: ClientIdSchema });

export const getClientFn = createServerFn({ method: 'GET' })
  .validator((data: unknown) => Input.parse(data))
  .handler(async ({ data }): Promise<ClientDto | null> => {
    const app = getAppReadView();
    const client = app.queries.clients.getClient(data.id);
    return client ? clientToDto(client) : null;
  });
