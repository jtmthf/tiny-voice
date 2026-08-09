import { describe, it, expect } from 'vitest';
import { InMemoryClientRepo } from '@/clients/adapters/in-memory-client-repo';
import { InMemoryInvoiceRepo } from '@/invoicing/adapters/in-memory-invoice-repo';
import { InMemoryRevenueReadModel } from '@/reporting/adapters/in-memory-revenue-read-model';
import { makeClient } from '@/clients/entities/client';
import { emailAddress } from '@/clients/value-objects/email-address';
import { buildSentInvoice } from '@/invoicing/testing/invoice-factory';
import { FixedClock } from '@/shared/time/fixed-clock';
import { expectOk } from '@/shared/testing/expect-ok';
import { wireQueries } from './wire-queries';

describe('wireQueries', () => {
  it('wires listInvoices to summaries and round-trips a client', () => {
    const clientRepo = new InMemoryClientRepo();
    const invoiceRepo = new InMemoryInvoiceRepo();
    const revenueReadModel = new InMemoryRevenueReadModel();
    const clock = new FixedClock(new Date('2026-04-13T00:00:00Z'));

    const invoice = buildSentInvoice();
    const client = expectOk(
      makeClient({
        id: invoice.clientId,
        name: 'Ada Lovelace',
        email: expectOk(emailAddress('ada@example.com')),
        clock,
      }),
    );
    clientRepo.save(client);
    expectOk(invoiceRepo.save(invoice));

    const queries = wireQueries({ clientRepo, invoiceRepo, revenueReadModel });

    const summaries = queries.invoicing.listInvoices();
    expect(summaries).toHaveLength(1);
    expect(summaries[0]).toHaveProperty('outstandingBalance');
    expect(summaries[0]?.id).toBe(invoice.id);

    expect(queries.clients.getClient(client.id)).toEqual(client);
  });
});
