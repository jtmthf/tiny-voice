import { describe, it, expect } from 'vitest';
import { Money } from '@/shared/money/money';
import type { YearMonth } from '@/shared/time/year-month';
import { InMemoryRevenueReadModel } from '../adapters/in-memory-revenue-read-model';
import { getRevenueByYear } from './get-revenue-by-year';

describe('getRevenueByYear', () => {
  it('returns all months for the given year', async () => {
    const readModel = new InMemoryRevenueReadModel();
    readModel.recordPayment({ month: '2025-01' as YearMonth, amount: Money.fromCents(1000n), at: new Date('2025-01-01') });
    readModel.recordPayment({ month: '2025-06' as YearMonth, amount: Money.fromCents(2000n), at: new Date('2025-06-01') });

    const results = getRevenueByYear({ readModel }, 2025);
    expect(results).toHaveLength(2);
    expect(results[0]!.month).toBe('2025-01');
    expect(results[1]!.month).toBe('2025-06');
  });

  it('returns empty array when no data for the year', async () => {
    const readModel = new InMemoryRevenueReadModel();
    const results = getRevenueByYear({ readModel }, 2025);
    expect(results).toHaveLength(0);
  });
});
