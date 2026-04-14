import { describe, it, expect } from 'vitest';
import { Money } from '@/shared/money/money';
import type { YearMonth } from '@/shared/time/year-month';
import { InMemoryRevenueReadModel } from '../adapters/in-memory-revenue-read-model';
import { getRevenueByMonth } from './get-revenue-by-month';

const jan = '2025-01' as YearMonth;

describe('getRevenueByMonth', () => {
  it('returns the monthly revenue for a given month', async () => {
    const readModel = new InMemoryRevenueReadModel();
    readModel.recordPayment({ month: jan, amount: Money.fromCents(5000n), at: new Date('2025-01-15') });

    const result = getRevenueByMonth({ readModel }, jan);
    expect(result).not.toBeNull();
    expect(result!.total.cents).toBe(5000n);
  });

  it('returns null for a month with no data', async () => {
    const readModel = new InMemoryRevenueReadModel();
    const result = getRevenueByMonth({ readModel }, jan);
    expect(result).toBeNull();
  });
});
