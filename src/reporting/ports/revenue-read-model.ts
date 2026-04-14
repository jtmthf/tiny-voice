import type { Money } from '@/shared/money/money';
import type { YearMonth } from '@/shared/time/year-month';

export interface MonthlyRevenue {
  readonly month: YearMonth;
  readonly total: Money;
  readonly paymentCount: number;
  readonly updatedAt: Date;
}

export interface RevenueReadModel {
  /** Idempotent-safe increment: adds `amount` to the row for (month, currency), creating if missing. */
  recordPayment(input: { month: YearMonth; amount: Money; at: Date }): void;

  getByMonth(month: YearMonth): MonthlyRevenue | null;
  getByYear(year: number): readonly MonthlyRevenue[];
  listAll(): readonly MonthlyRevenue[];
}
