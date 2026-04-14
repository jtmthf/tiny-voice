import { describe, it, expect } from 'vitest';
import type { InvoiceId } from '@/shared/ids/invoice-id';
import { newLineItemId } from '@/shared/ids/line-item-id';
import { InMemoryInvoiceRepo } from '../adapters/in-memory-invoice-repo';
import { buildDraftInvoice, buildSentInvoice } from '../testing/invoice-factory';
import { addLineItem } from './add-line-item';

describe('addLineItem command', () => {
  it('adds a line item to a draft invoice', async () => {
    const repo = new InMemoryInvoiceRepo();
    const invoice = buildDraftInvoice();
    repo.save(invoice);

    const result = await addLineItem(
      { repo },
      {
        invoiceId: invoice.id,
        lineItemId: newLineItemId(),
        description: 'Consulting hours',
        quantity: 5,
        unitPriceCents: 15000n,
      },
    );

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.lineItems).toHaveLength(1);
      expect(result.value.lineItems[0]!.description).toBe('Consulting hours');
    }
  });

  it('rejects adding a line item to a sent invoice', async () => {
    const repo = new InMemoryInvoiceRepo();
    const invoice = buildSentInvoice();
    repo.save(invoice);

    const result = await addLineItem(
      { repo },
      {
        invoiceId: invoice.id,
        lineItemId: newLineItemId(),
        description: 'Late addition',
        quantity: 1,
        unitPriceCents: 1000n,
      },
    );

    expect(result.isErr()).toBe(true);
  });

  it('returns error for non-existent invoice', async () => {
    const repo = new InMemoryInvoiceRepo();
    const result = await addLineItem(
      { repo },
      {
        invoiceId: newLineItemId() as unknown as InvoiceId,
        lineItemId: newLineItemId(),
        description: 'Nope',
        quantity: 1,
        unitPriceCents: 1000n,
      },
    );

    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error.kind).toBe('InvalidInput');
  });
});
