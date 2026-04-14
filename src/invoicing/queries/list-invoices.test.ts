import { describe, it, expect } from 'vitest';
import { newClientId } from '@/shared/ids/client-id';
import { InMemoryInvoiceRepo } from '../adapters/in-memory-invoice-repo';
import { buildDraftInvoice, buildSentInvoice, buildLineItem } from '../testing/invoice-factory';
import { listInvoices } from './list-invoices';

describe('listInvoices', () => {
  it('returns empty array when no invoices', () => {
    const repo = new InMemoryInvoiceRepo();
    const result = listInvoices({ repo });
    expect(result).toEqual([]);
  });

  it('returns all invoices when no filters', () => {
    const repo = new InMemoryInvoiceRepo();
    const draft = buildDraftInvoice({ lineItems: [buildLineItem()] });
    const sent = buildSentInvoice();
    repo.save(draft);
    repo.save(sent);

    const result = listInvoices({ repo });
    expect(result).toHaveLength(2);
  });

  it('filters by status', () => {
    const repo = new InMemoryInvoiceRepo();
    const draft = buildDraftInvoice({ lineItems: [buildLineItem()] });
    const sent = buildSentInvoice();
    repo.save(draft);
    repo.save(sent);

    const result = listInvoices({ repo }, { status: 'sent' });
    expect(result).toHaveLength(1);
    expect(result[0]!.status).toBe('sent');
  });

  it('filters by clientId', () => {
    const repo = new InMemoryInvoiceRepo();
    const clientA = newClientId();
    const clientB = newClientId();
    const invoiceA = buildDraftInvoice({ lineItems: [buildLineItem()] });
    const invoiceB = buildDraftInvoice({ lineItems: [buildLineItem()] });
    // Overwrite clientId via spread (factory doesn't expose clientId override, so save with correct one)
    const a = { ...invoiceA, clientId: clientA };
    const b = { ...invoiceB, clientId: clientB };
    repo.save(a);
    repo.save(b);

    const result = listInvoices({ repo }, { clientId: clientA });
    expect(result).toHaveLength(1);
    expect(result[0]!.clientId).toBe(clientA);
  });
});
