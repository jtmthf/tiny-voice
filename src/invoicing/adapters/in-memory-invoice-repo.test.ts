import { describe, it, expect, beforeEach } from 'vitest';
import { newInvoiceId } from '@/shared/ids/invoice-id';
import { InMemoryInvoiceRepo } from './in-memory-invoice-repo';
import {
  buildDraftInvoice,
  buildSentInvoice,
  buildLineItem,
} from '../testing/invoice-factory';
import { addLineItem } from '../entities/invoice';

describe('InMemoryInvoiceRepo', () => {
  let repo: InMemoryInvoiceRepo;

  beforeEach(() => {
    repo = new InMemoryInvoiceRepo();
  });

  it('round-trips an invoice', async () => {
    const invoice = buildDraftInvoice({ lineItems: [buildLineItem()] });
    const saveResult = repo.save(invoice);
    expect(saveResult.isOk()).toBe(true);

    const found = repo.findById(invoice.id);
    expect(found).not.toBeNull();
    expect(found!.id).toBe(invoice.id);
    expect(found!.lineItems).toHaveLength(1);
  });

  it('returns null for unknown id', async () => {
    const found = repo.findById(newInvoiceId());
    expect(found).toBeNull();
  });

  it('detects version conflict on stale update', async () => {
    const invoice = buildDraftInvoice({ lineItems: [buildLineItem()] });
    repo.save(invoice);

    // Two concurrent modifications
    const a = addLineItem(invoice, buildLineItem())._unsafeUnwrap();
    const b = addLineItem(invoice, buildLineItem())._unsafeUnwrap();

    const saveA = repo.save(a);
    expect(saveA.isOk()).toBe(true);

    const saveB = repo.save(b);
    expect(saveB.isErr()).toBe(true);
    if (saveB.isErr()) expect(saveB.error.kind).toBe('ConcurrencyConflict');
  });

  it('clones on save to prevent aliasing', async () => {
    const invoice = buildDraftInvoice({ lineItems: [buildLineItem()] });
    repo.save(invoice);

    const found = repo.findById(invoice.id);
    const found2 = repo.findById(invoice.id);
    expect(found).not.toBe(found2); // different object references
  });

  it('lists with status filter', async () => {
    const draft = buildDraftInvoice({ lineItems: [buildLineItem()] });
    const sent = buildSentInvoice();

    repo.save(draft);
    repo.save(sent);

    const drafts = repo.list({ status: 'draft' });
    expect(drafts).toHaveLength(1);
    expect(drafts[0]!.status).toBe('draft');

    const sents = repo.list({ status: 'sent' });
    expect(sents).toHaveLength(1);
    expect(sents[0]!.status).toBe('sent');
  });

  it('lists with clientId filter', async () => {
    const a = buildDraftInvoice({ lineItems: [buildLineItem()] });
    const b = buildDraftInvoice({ lineItems: [buildLineItem()] });
    repo.save(a);
    repo.save(b);

    const results = repo.list({ clientId: a.clientId });
    expect(results).toHaveLength(1);
    expect(results[0]!.id).toBe(a.id);
  });
});
