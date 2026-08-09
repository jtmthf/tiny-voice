import { createServerFn } from '@tanstack/react-start';
import { getAppReadView } from '@/app/instance';
import { clientToDto } from './dto';

export const listClientsFn = createServerFn({ method: 'GET' }).handler(async () => {
  const app = getAppReadView();
  return app.queries.clients.listClients().map(clientToDto);
});
