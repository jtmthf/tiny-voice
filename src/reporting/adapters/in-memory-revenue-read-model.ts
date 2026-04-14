import { Money } from '@/shared/money/money';
import { add } from '@/shared/money/money';
import type { YearMonth } from '@/shared/time/year-month';
import type { MonthlyRevenue, RevenueReadModel } from '../ports/revenue-read-model';

export class InMemoryRevenueReadModel implements RevenueReadModel {
  private readonly store = new Map<string, MonthlyRevenue>();

  private key(month: YearMonth, currency: string): string {
    return `${month}:${currency}`;
  }

  recordPayment(input: { month: YearMonth; amount: Money; at: Date }): void {
    const k = this.key(input.month, input.amount.currency);
    const existing = this.store.get(k);

    if (existing) {
      const sumResult = add(existing.total, input.amount);
      if (sumResult.isErr()) throw new Error(sumResult.error.message);
      this.store.set(k, {
        month: existing.month,
        total: sumResult.value,
        paymentCount: existing.paymentCount + 1,
        updatedAt: input.at,
      });
    } else {
      this.store.set(k, {
        month: input.month,
        total: input.amount,
        paymentCount: 1,
        updatedAt: input.at,
      });
    }
  }

  getByMonth(month: YearMonth): MonthlyRevenue | null {
    // Single-currency demo: look up USD key
    return this.store.get(this.key(month, 'USD')) ?? null;
  }

  getByYear(year: number): readonly MonthlyRevenue[] {
    const prefix = `${year}-`;
    return [...this.store.values()]
      .filter((r) => r.month.startsWith(prefix))
      .sort((a, b) => (a.month < b.month ? -1 : a.month > b.month ? 1 : 0));
  }

  listAll(): readonly MonthlyRevenue[] {
    return [...this.store.values()].sort((a, b) =>
      a.month > b.month ? -1 : a.month < b.month ? 1 : 0,
    );
  }
}
