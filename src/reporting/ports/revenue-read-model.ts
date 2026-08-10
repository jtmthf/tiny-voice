import type { Money } from '@/shared/money/money';
import { type YearMonth } from '@/shared/time/year-month';

export interface MonthlyRevenue {
  readonly month: YearMonth;
  readonly total: Money;
  readonly paymentCount: number;
  readonly updatedAt: Date;
}

export interface RevenueReadModel {
  /**
   * Idempotent increment: adds `amount` to the row for (month, currency),
   * creating if missing. Redelivering the same `paymentId` is a no-op.
   */
  recordPayment(input: { paymentId: string; month: YearMonth; amount: Money; at: Date }): void;

  getByMonth(month: YearMonth): MonthlyRevenue | null;
  getByYear(year: number): readonly MonthlyRevenue[];
  listAll(): readonly MonthlyRevenue[];
}
