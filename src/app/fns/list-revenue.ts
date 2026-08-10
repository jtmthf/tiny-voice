import { createServerFn } from '@tanstack/react-start';
import { getAppReadView } from '@/app/instance';
import { revenueToDto } from './dto';

export const listRevenueFn = createServerFn({ method: 'GET' }).handler(() => {
  const app = getAppReadView();
  return app.queries.reporting.listAllRevenue().map(revenueToDto);
});
