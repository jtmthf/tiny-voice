import { describe, it, expect } from 'vitest';
import { newInvoiceId } from '@/shared/ids/invoice-id';
import { Money } from '@/shared/money/money';
import { InMemoryInvoiceRepo } from '../adapters/in-memory-invoice-repo';
import { buildDraftInvoice, buildLineItem } from '../testing/invoice-factory';
import { getInvoiceLineItems } from './get-invoice-line-items';

describe('getInvoiceLineItems', () => {
  it('returns null for unknown invoice', () => {
    const repo = new InMemoryInvoiceRepo();
    const result = getInvoiceLineItems({ repo }, newInvoiceId());
    expect(result).toBeNull();
  });

  it('returns mapped line items', () => {
    const repo = new InMemoryInvoiceRepo();
    const items = [
      buildLineItem({ description: 'Design work', quantity: 3, unitPrice: Money.fromCents(15000n) }),
      buildLineItem({ description: 'Development', quantity: 1, unitPrice: Money.fromCents(50000n) }),
    ];
    const invoice = buildDraftInvoice({ lineItems: items });
    repo.save(invoice);

    const result = getInvoiceLineItems({ repo }, invoice.id);

    expect(result).not.toBeNull();
    expect(result).toHaveLength(2);
    expect(result![0]!.description).toBe('Design work');
    expect(result![0]!.quantity).toBe(3);
    expect(result![0]!.unitPrice.cents).toBe(15000n);
    expect(result![1]!.description).toBe('Development');
  });
});
