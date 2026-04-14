import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { Database } from '@/shared/db/database';
import { setupDb } from '@/shared/testing/db-fixture';
import { Money } from '@/shared/money/money';
import type { YearMonth } from '@/shared/time/year-month';
import { SqliteRevenueReadModel } from './sqlite-revenue-read-model';

const jan = '2025-01' as YearMonth;
const feb = '2025-02' as YearMonth;
const mar = '2025-03' as YearMonth;
const dec24 = '2024-12' as YearMonth;

function usd(cents: bigint): Money {
  return Money.fromCents(cents);
}

describe('SqliteRevenueReadModel', () => {
  let db: Database;
  let teardown: () => void;
  let model: SqliteRevenueReadModel;

  beforeEach(() => {
    const fixture = setupDb();
    db = fixture.db;
    teardown = fixture.teardown;
    model = new SqliteRevenueReadModel(db);
  });

  afterEach(() => {
    teardown();
  });

  it('records a payment and retrieves by month', async () => {
    model.recordPayment({ month: jan, amount: usd(5000n), at: new Date('2025-01-15') });

    const result = model.getByMonth(jan);
    expect(result).not.toBeNull();
    expect(result!.month).toBe(jan);
    expect(result!.total.cents).toBe(5000n);
    expect(result!.paymentCount).toBe(1);
  });

  it('aggregates multiple payments in the same month', async () => {
    model.recordPayment({ month: jan, amount: usd(5000n), at: new Date('2025-01-10') });
    model.recordPayment({ month: jan, amount: usd(3000n), at: new Date('2025-01-20') });

    const result = model.getByMonth(jan);
    expect(result!.total.cents).toBe(8000n);
    expect(result!.paymentCount).toBe(2);
  });

  it('returns null for unknown month', async () => {
    const result = model.getByMonth(jan);
    expect(result).toBeNull();
  });

  it('getByYear returns months in ascending order', async () => {
    model.recordPayment({ month: mar, amount: usd(1000n), at: new Date('2025-03-01') });
    model.recordPayment({ month: jan, amount: usd(2000n), at: new Date('2025-01-01') });
    model.recordPayment({ month: feb, amount: usd(3000n), at: new Date('2025-02-01') });

    const results = model.getByYear(2025);
    expect(results).toHaveLength(3);
    expect(results[0]!.month).toBe(jan);
    expect(results[1]!.month).toBe(feb);
    expect(results[2]!.month).toBe(mar);
  });

  it('getByYear excludes other years', async () => {
    model.recordPayment({ month: jan, amount: usd(1000n), at: new Date('2025-01-01') });
    model.recordPayment({ month: dec24, amount: usd(2000n), at: new Date('2024-12-01') });

    const results = model.getByYear(2025);
    expect(results).toHaveLength(1);
    expect(results[0]!.month).toBe(jan);
  });

  it('listAll returns months in descending order', async () => {
    model.recordPayment({ month: jan, amount: usd(1000n), at: new Date('2025-01-01') });
    model.recordPayment({ month: mar, amount: usd(2000n), at: new Date('2025-03-01') });
    model.recordPayment({ month: feb, amount: usd(3000n), at: new Date('2025-02-01') });

    const results = model.listAll();
    expect(results).toHaveLength(3);
    expect(results[0]!.month).toBe(mar);
    expect(results[1]!.month).toBe(feb);
    expect(results[2]!.month).toBe(jan);
  });
});
