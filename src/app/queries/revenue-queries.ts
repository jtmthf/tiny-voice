import { queryOptions } from '@tanstack/react-query';
import { listRevenueFn } from '@/app/fns/list-revenue';

export const revenueQueryOptions = () =>
  queryOptions({ queryKey: ['revenue'], queryFn: () => listRevenueFn() });
