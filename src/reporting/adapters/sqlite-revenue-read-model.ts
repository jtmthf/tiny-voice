import type { Database } from '@/shared/db/database';
import type { Money } from '@/shared/money/money';
import type { YearMonth } from '@/shared/time/year-month';
import type { MonthlyRevenue, RevenueReadModel } from '../ports/revenue-read-model';

interface RevenueRow {
  month: string;
  currency: string;
  total_cents: number;
  payment_count: number;
  updated_at: string;
}

function rowToMonthlyRevenue(row: RevenueRow): MonthlyRevenue {
  return {
    month: row.month as YearMonth,
    total: { cents: BigInt(row.total_cents), currency: 'USD' } satisfies Money,
    paymentCount: row.payment_count,
    updatedAt: new Date(row.updated_at),
  };
}

export class SqliteRevenueReadModel implements RevenueReadModel {
  constructor(private readonly db: Database) {}

  recordPayment(input: { month: YearMonth; amount: Money; at: Date }): void {
    this.db
      .prepare(
        `INSERT INTO revenue_by_month (month, currency, total_cents, payment_count, updated_at)
         VALUES (?, ?, ?, 1, ?)
         ON CONFLICT(month, currency) DO UPDATE SET
           total_cents = total_cents + excluded.total_cents,
           payment_count = payment_count + 1,
           updated_at = excluded.updated_at`,
      )
      .run(
        input.month,
        input.amount.currency,
        Number(input.amount.cents),
        input.at.toISOString(),
      );
  }

  getByMonth(month: YearMonth): MonthlyRevenue | null {
    const row = this.db
      .prepare<RevenueRow>('SELECT * FROM revenue_by_month WHERE month = ?')
      .get(month);
    return row ? rowToMonthlyRevenue(row) : null;
  }

  getByYear(year: number): readonly MonthlyRevenue[] {
    const prefix = `${year}-`;
    const rows = this.db
      .prepare<RevenueRow>(
        "SELECT * FROM revenue_by_month WHERE month LIKE ? || '%' ORDER BY month ASC",
      )
      .all(prefix);
    return rows.map(rowToMonthlyRevenue);
  }

  listAll(): readonly MonthlyRevenue[] {
    const rows = this.db
      .prepare<RevenueRow>('SELECT * FROM revenue_by_month ORDER BY month DESC')
      .all();
    return rows.map(rowToMonthlyRevenue);
  }
}
