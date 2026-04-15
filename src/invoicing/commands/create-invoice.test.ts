import { describe, it, expect } from 'vitest';
import { newInvoiceId } from '@/shared/ids/invoice-id';
import { newClientId } from '@/shared/ids/client-id';
import { newLineItemId } from '@/shared/ids/line-item-id';
import { FixedClock } from '@/shared/time/fixed-clock';
import type { DueDate } from '@/shared/time/due-date';
import type { TaxRate } from '../value-objects/tax-rate';
import { InMemoryInvoiceRepo } from '../adapters/in-memory-invoice-repo';
import { createInvoice } from './create-invoice';

describe('createInvoice command', () => {
  it('creates a draft invoice with no line items', () => {
    const repo = new InMemoryInvoiceRepo();
    const clock = new FixedClock(new Date('2025-01-15T12:00:00Z'));

    const result = createInvoice(
      { repo, clock },
      {
        id: newInvoiceId(),
        clientId: newClientId(),
        taxRate: 0.1 as TaxRate,
        dueDate: '2025-02-15' as DueDate,
        lineItems: [],
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

  it('creates a draft invoice with line items atomically', () => {
    const repo = new InMemoryInvoiceRepo();
    const clock = new FixedClock(new Date('2025-01-15T12:00:00Z'));

    const result = createInvoice(
      { repo, clock },
      {
        id: newInvoiceId(),
        clientId: newClientId(),
        taxRate: 0.1 as TaxRate,
        dueDate: '2025-02-15' as DueDate,
        lineItems: [
          { id: newLineItemId(), description: 'Widget', quantity: 2, unitPriceCents: 5000n },
          { id: newLineItemId(), description: 'Gadget', quantity: 1, unitPriceCents: 10000n },
        ],
      },
    );

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.status).toBe('draft');
      expect(result.value.lineItems).toHaveLength(2);
      expect(result.value.lineItems[0]!.description).toBe('Widget');
      expect(result.value.lineItems[1]!.description).toBe('Gadget');
      // version: 1 (create) + 2 (two addLineItem transitions)
      expect(result.value.version).toBe(3);

      const persisted = repo.findById(result.value.id);
      expect(persisted).not.toBeNull();
      expect(persisted!.lineItems).toHaveLength(2);
    }
  });
});
