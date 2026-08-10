import { describe, it, expect } from 'vitest';
import { InMemoryInvoiceRepo } from '../adapters/in-memory-invoice-repo';
import { deleteInvoice } from './delete-invoice';
import { newInvoiceId } from '@/shared/ids/invoice-id';
import { newClientId } from '@/shared/ids/client-id';
import { createInvoice } from '../entities/invoice';
import type { DueDate } from '@/shared/time/due-date';
import type { TaxRate } from '../value-objects/tax-rate';
import { expectOk } from '@/shared/testing/expect-ok';
import { expectErr } from '@/shared/testing/expect-err';

describe('deleteInvoice', () => {
  it('deletes an invoice', () => {
    const repo = new InMemoryInvoiceRepo();
    const invoiceId = newInvoiceId();
    const clientId = newClientId();

    repo.save(
      createInvoice({
        id: invoiceId,
        clientId,
        taxRate: 0 as TaxRate,
        dueDate: '2025-12-31' as DueDate,
        createdAt: new Date(),
      }),
    );

    const result = deleteInvoice({ repo }, { invoiceId });
    expectOk(result);

    expect(repo.findById(invoiceId)).toBeNull();
  });

  it('returns NotFound when invoice does not exist', () => {
    const repo = new InMemoryInvoiceRepo();
    const result = deleteInvoice({ repo }, { invoiceId: newInvoiceId() });
    expect(expectErr(result)).toEqual({ kind: 'NotFound' });
  });
});
