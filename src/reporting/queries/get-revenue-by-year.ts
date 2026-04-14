import type { MonthlyRevenue, RevenueReadModel } from '../ports/revenue-read-model';

export function getRevenueByYear(
  deps: { readModel: RevenueReadModel },
  year: number,
): readonly MonthlyRevenue[] {
  return deps.readModel.getByYear(year);
}
