import type { Database } from '@/shared/db/database';
import type { Money } from '@/shared/money/money';
import type { YearMonth } from '@/shared/time/year-month';
import type { MonthlyRevenue, RevenueReadModel } from '../ports/revenue-read-model';

interface RevenueRow {
  month: string;
  currency: string;
  total_cents: string;
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
    const existing = this.db
      .prepare<RevenueRow>(
        'SELECT * FROM revenue_by_month WHERE month = ? AND currency = ?',
      )
      .get(input.month, input.amount.currency);

    if (existing) {
      const newTotal = BigInt(existing.total_cents) + input.amount.cents;
      this.db
        .prepare(
          `UPDATE revenue_by_month
           SET total_cents = ?, payment_count = payment_count + 1, updated_at = ?
           WHERE month = ? AND currency = ?`,
        )
        .run(
          newTotal.toString(),
          input.at.toISOString(),
          input.month,
          input.amount.currency,
        );
    } else {
      this.db
        .prepare(
          `INSERT INTO revenue_by_month (month, currency, total_cents, payment_count, updated_at)
           VALUES (?, ?, ?, 1, ?)`,
        )
        .run(
          input.month,
          input.amount.currency,
          input.amount.cents.toString(),
          input.at.toISOString(),
        );
    }
  }

  getByMonth(month: YearMonth): MonthlyRevenue | null {
    const row = this.db
      .prepare<RevenueRow>('SELECT * FROM revenue_by_month WHERE month = ?')
      .get(month);
    return row ? rowToMonthlyRevenue(row) : null;
  }

  getByYear(year: number): readonly MonthlyRevenue[] {
    const rows = this.db
      .prepare<RevenueRow>(
        'SELECT * FROM revenue_by_month WHERE month >= ? AND month <= ? ORDER BY month ASC',
      )
      .all(`${year}-01`, `${year}-12`);
    return rows.map(rowToMonthlyRevenue);
  }

  listAll(): readonly MonthlyRevenue[] {
    const rows = this.db
      .prepare<RevenueRow>('SELECT * FROM revenue_by_month ORDER BY month DESC')
      .all();
    return rows.map(rowToMonthlyRevenue);
  }
}
