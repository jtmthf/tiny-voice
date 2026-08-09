import { describe, it, expect } from 'vitest';
import { InMemoryClientRepo } from '../adapters/in-memory-client-repo';
import { InMemoryInvoiceRepo } from '../../invoicing/adapters/in-memory-invoice-repo';
import { deleteClient } from './delete-client';
import { newClientId } from '../../shared/ids/client-id';
import { newInvoiceId } from '../../shared/ids/invoice-id';
import { createInvoice } from '../../invoicing/entities/invoice';
import type { DueDate } from '../../shared/time/due-date';
import type { TaxRate } from '../../invoicing/value-objects/tax-rate';
import { expectOk } from '../../shared/testing/expect-ok';
import { expectErr } from '../../shared/testing/expect-err';
import { emailAddress } from '../value-objects/email-address';

function makeDeps() {
  return {
    clientRepo: new InMemoryClientRepo(),
    invoiceRepo: new InMemoryInvoiceRepo(),
  };
}

describe('deleteClient', () => {
  it('deletes a client and cascades their invoices', () => {
    const deps = makeDeps();
    const clientId = newClientId();
    const invoiceId = newInvoiceId();

    const emailResult = emailAddress('acme@example.com');
    if (emailResult.isErr()) throw new Error('Invalid email');
    deps.clientRepo.save({
      id: clientId,
      name: 'Acme',
      email: emailResult.value,
      createdAt: new Date(),
    });

    deps.invoiceRepo.save(
      createInvoice({
        id: invoiceId,
        clientId,
        taxRate: 0 as TaxRate,
        dueDate: '2025-12-31' as DueDate,
        createdAt: new Date(),
      }),
    );

    const result = deleteClient(deps, { clientId });
    expectOk(result);

    expect(deps.clientRepo.findById(clientId)).toBeNull();
    expect(deps.invoiceRepo.findById(invoiceId)).toBeNull();
  });

  it('returns NotFound when client does not exist', () => {
    const deps = makeDeps();
    const result = deleteClient(deps, { clientId: newClientId() });
    expect(expectErr(result)).toEqual({ kind: 'NotFound' });
  });
});
