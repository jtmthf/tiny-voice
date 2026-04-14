import type { YearMonth } from '@/shared/time/year-month';
import type { MonthlyRevenue, RevenueReadModel } from '../ports/revenue-read-model';

export function getRevenueByMonth(
  deps: { readModel: RevenueReadModel },
  month: YearMonth,
): MonthlyRevenue | null {
  return deps.readModel.getByMonth(month);
}
