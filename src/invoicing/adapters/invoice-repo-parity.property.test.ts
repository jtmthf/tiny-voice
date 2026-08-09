import { it } from '@fast-check/vitest';
import { describe, expect } from 'vitest';
import { setupDb } from '@/shared/testing/db-fixture';
import type { LineItem } from '../entities/line-item';
import type { Payment } from '../entities/payment';
import { buildDraftInvoice, buildLineItem, buildSentInvoice } from '../testing/invoice-factory';
import { invoiceArbitrary } from '../testing/invoice-arbitraries';
import { InMemoryInvoiceRepo } from './in-memory-invoice-repo';
import { SqliteInvoiceRepo } from './sqlite-invoice-repo';

function lineItemsById(items: readonly LineItem[]) {
  return new Map(
    items.map((li) => [
      li.id,
      {
        description: li.description,
        quantity: li.quantity,
        unitPriceCents: li.unitPrice.cents,
        kind: li.kind,
      },
    ]),
  );
}

function paymentsById(payments: readonly Payment[]) {
  return new Map(
    payments.map((p) => [
      p.id,
      { amountCents: p.amount.cents, recordedAtMs: p.recordedAt.getTime() },
    ]),
  );
}

describe('SQLite <-> in-memory invoice repo parity', () => {
  it.prop([invoiceArbitrary], { numRuns: 25 })(
    'findById and listSummaries agree between adapters',
    (invoice) => {
      const { db, teardown } = setupDb();
      try {
        const sqliteRepo = new SqliteInvoiceRepo(db);
        const memRepo = new InMemoryInvoiceRepo();

        expect(sqliteRepo.save(invoice).isOk()).toBe(true);
        expect(memRepo.save(invoice).isOk()).toBe(true);

        // 1. findById round-trip parity
        const sqliteFound = sqliteRepo.findById(invoice.id);
        const memFound = memRepo.findById(invoice.id);
        expect(sqliteFound).not.toBeNull();
        expect(memFound).not.toBeNull();
        expect(sqliteFound!.status).toBe(memFound!.status);
        expect(sqliteFound!.dueDate).toBe(memFound!.dueDate);
        expect(sqliteFound!.taxRate).toBe(memFound!.taxRate);
        expect(sqliteFound!.version).toBe(memFound!.version);
        expect(lineItemsById(sqliteFound!.lineItems)).toEqual(lineItemsById(memFound!.lineItems));
        expect(paymentsById(sqliteFound!.payments)).toEqual(paymentsById(memFound!.payments));

        // 2. listSummaries() parity
        const sqliteSummary = sqliteRepo.listSummaries().find((s) => s.id === invoice.id);
        const memSummary = memRepo.listSummaries().find((s) => s.id === invoice.id);
        expect(sqliteSummary).toBeDefined();
        expect(memSummary).toBeDefined();
        expect(sqliteSummary!.lineItemCount).toBe(memSummary!.lineItemCount);
        expect(sqliteSummary!.subtotalCents).toBe(memSummary!.subtotalCents);
        expect(sqliteSummary!.paidAmountCents).toBe(memSummary!.paidAmountCents);
        expect(sqliteSummary!.status).toBe(memSummary!.status);

        // 3. listSummaries({ status }) filter parity
        const sqliteFiltered = sqliteRepo
          .listSummaries({ status: invoice.status })
          .find((s) => s.id === invoice.id);
        const memFiltered = memRepo
          .listSummaries({ status: invoice.status })
          .find((s) => s.id === invoice.id);
        expect(sqliteFiltered).toBeDefined();
        expect(memFiltered).toBeDefined();
        expect(sqliteFiltered!.lineItemCount).toBe(memFiltered!.lineItemCount);
        expect(sqliteFiltered!.subtotalCents).toBe(memFiltered!.subtotalCents);
        expect(sqliteFiltered!.paidAmountCents).toBe(memFiltered!.paidAmountCents);
      } finally {
        teardown();
      }
    },
  );

  it('zero-payment invoice: both adapters report paidAmountCents 0', () => {
    const { db, teardown } = setupDb();
    try {
      const invoice = buildSentInvoice({ lineItems: [buildLineItem()] });
      const sqliteRepo = new SqliteInvoiceRepo(db);
      const memRepo = new InMemoryInvoiceRepo();
      sqliteRepo.save(invoice);
      memRepo.save(invoice);

      const sqliteSummary = sqliteRepo.listSummaries().find((s) => s.id === invoice.id);
      const memSummary = memRepo.listSummaries().find((s) => s.id === invoice.id);
      expect(sqliteSummary!.paidAmountCents).toBe(0n);
      expect(memSummary!.paidAmountCents).toBe(0n);
    } finally {
      teardown();
    }
  });

  it('draft invoice with zero line items: both adapters report subtotalCents/lineItemCount 0', () => {
    const { db, teardown } = setupDb();
    try {
      const invoice = buildDraftInvoice();
      const sqliteRepo = new SqliteInvoiceRepo(db);
      const memRepo = new InMemoryInvoiceRepo();
      sqliteRepo.save(invoice);
      memRepo.save(invoice);

      const sqliteSummary = sqliteRepo.listSummaries().find((s) => s.id === invoice.id);
      const memSummary = memRepo.listSummaries().find((s) => s.id === invoice.id);
      expect(sqliteSummary!.subtotalCents).toBe(0n);
      expect(sqliteSummary!.lineItemCount).toBe(0);
      expect(memSummary!.subtotalCents).toBe(0n);
      expect(memSummary!.lineItemCount).toBe(0);
    } finally {
      teardown();
    }
  });
});
