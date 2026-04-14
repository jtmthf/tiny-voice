import { describe, it, expect } from 'vitest';
import { newInvoiceId } from '@/shared/ids/invoice-id';
import { newClientId } from '@/shared/ids/client-id';
import { FixedClock } from '@/shared/time/fixed-clock';
import type { DueDate } from '@/shared/time/due-date';
import type { TaxRate } from '../value-objects/tax-rate';
import { InMemoryInvoiceRepo } from '../adapters/in-memory-invoice-repo';
import { createInvoice } from './create-invoice';

describe('createInvoice command', () => {
  it('creates a draft invoice and persists it', async () => {
    const repo = new InMemoryInvoiceRepo();
    const clock = new FixedClock(new Date('2025-01-15T12:00:00Z'));

    const result = await createInvoice(
      { repo, clock },
      {
        id: newInvoiceId(),
        clientId: newClientId(),
        taxRate: 0.1 as TaxRate,
        dueDate: '2025-02-15' as DueDate,
      },
    );

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.status).toBe('draft');
      expect(result.value.lineItems).toHaveLength(0);
      expect(result.value.version).toBe(1);

      const persisted = repo.findById(result.value.id);
      expect(persisted).not.toBeNull();
    }
  });
});
