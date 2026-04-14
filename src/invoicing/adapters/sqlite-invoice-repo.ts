import type { InvoiceId } from '@/shared/ids/invoice-id';
import type { ClientId } from '@/shared/ids/client-id';
import type { Database } from '@/shared/db/database';
import type { Result } from 'neverthrow';
import { ok, err } from 'neverthrow';
import { fromDb, toDb } from '@/shared/ids/id';
import { Money } from '@/shared/money/money';
import type { Invoice } from '../entities/invoice';
import type { LineItem } from '../entities/line-item';
import type { Payment } from '../entities/payment';
import type { InvoiceError } from '../errors/invoice-error';
import { InvoiceError as IE } from '../errors/invoice-error';
import type { InvoiceStatus } from '../value-objects/invoice-status';
import type { TaxRate } from '../value-objects/tax-rate';
import type { DueDate } from '@/shared/time/due-date';
import type { InvoiceRepository, InvoiceListItem } from '../ports/invoice-repository';

interface InvoiceRow {
  id: string;
  client_id: string;
  status: string;
  tax_rate: number;
  due_date: string;
  created_at: string;
  version: number;
}

interface InvoiceWithChildrenRow extends InvoiceRow {
  line_items_json: string;
  payments_json: string;
}

interface SummaryRow extends InvoiceRow {
  line_item_count: number;
  subtotal_cents: string | null;
  paid_amount_cents: string | null;
}

interface LineItemRow {
  id: string;
  invoice_id: string;
  description: string;
  quantity: number;
  unit_price_cents: string; // bigint stored as TEXT
}

interface PaymentRow {
  id: string;
  invoice_id: string;
  amount_cents: string; // bigint stored as TEXT
  recorded_at: string;
}

function toLineItem(row: LineItemRow): LineItem {
  return {
    id: fromDb('li', row.id),
    description: row.description,
    quantity: row.quantity,
    unitPrice: Money.fromCents(BigInt(row.unit_price_cents)),
  };
}

function toPayment(row: PaymentRow): Payment {
  return {
    id: fromDb('pay', row.id),
    amount: Money.fromCents(BigInt(row.amount_cents)),
    recordedAt: new Date(row.recorded_at),
  };
}

function toInvoice(row: InvoiceRow, lineItems: LineItem[], payments: Payment[]): Invoice {
  return {
    id: fromDb('inv', row.id),
    clientId: fromDb('client', row.client_id),
    status: row.status as InvoiceStatus,
    lineItems,
    payments,
    taxRate: row.tax_rate as TaxRate,
    dueDate: row.due_date as DueDate,
    createdAt: new Date(row.created_at),
    version: row.version,
  };
}

export class SqliteInvoiceRepo implements InvoiceRepository {
  constructor(private readonly db: Database) {}

  findById(id: InvoiceId): Invoice | null {
    const rawId = toDb(id);
    const row = this.db.prepare<InvoiceRow>('SELECT * FROM invoices WHERE id = ?').get(rawId);
    if (!row) return null;

    const lineItemRows = this.db
      .prepare<LineItemRow>('SELECT * FROM line_items WHERE invoice_id = ?')
      .all(rawId);
    const paymentRows = this.db
      .prepare<PaymentRow>('SELECT * FROM payments WHERE invoice_id = ? ORDER BY recorded_at')
      .all(rawId);

    return toInvoice(row, lineItemRows.map(toLineItem), paymentRows.map(toPayment));
  }

  save(invoice: Invoice): Result<void, InvoiceError> {
    const rawId = toDb(invoice.id);
    const rawClientId = toDb(invoice.clientId);

    return this.db.transaction(() => {
      // Check if invoice already exists
      const existing = this.db
        .prepare<InvoiceRow>('SELECT id, version FROM invoices WHERE id = ?')
        .get(rawId);

      if (existing) {
        // Update with optimistic concurrency check
        const result = this.db
          .prepare(
            `UPDATE invoices SET client_id = ?, status = ?, tax_rate = ?, due_date = ?, created_at = ?, version = ?
             WHERE id = ? AND version = ?`,
          )
          .run(
            rawClientId,
            invoice.status,
            invoice.taxRate,
            invoice.dueDate,
            invoice.createdAt.toISOString(),
            invoice.version,
            rawId,
            invoice.version - 1,
          );

        if (result.changes === 0) {
          return err(IE.concurrencyConflict());
        }
      } else {
        // Insert new invoice
        this.db
          .prepare(
            `INSERT INTO invoices (id, client_id, status, tax_rate, due_date, created_at, version)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(
            rawId,
            rawClientId,
            invoice.status,
            invoice.taxRate,
            invoice.dueDate,
            invoice.createdAt.toISOString(),
            invoice.version,
          );
      }

      // Delete and re-insert line items
      this.db.prepare('DELETE FROM line_items WHERE invoice_id = ?').run(rawId);
      const insertLineItem = this.db.prepare(
        'INSERT INTO line_items (id, invoice_id, description, quantity, unit_price_cents) VALUES (?, ?, ?, ?, ?)',
      );
      for (const li of invoice.lineItems) {
        insertLineItem.run(toDb(li.id), rawId, li.description, li.quantity, li.unitPrice.cents.toString());
      }

      // Insert only new payments (append-only).
      // We check which payment IDs already exist and insert only the missing ones.
      const existingPaymentIds = new Set(
        this.db
          .prepare<{ id: string }>('SELECT id FROM payments WHERE invoice_id = ?')
          .all(rawId)
          .map((r) => r.id),
      );
      const insertPayment = this.db.prepare(
        'INSERT INTO payments (id, invoice_id, amount_cents, recorded_at) VALUES (?, ?, ?, ?)',
      );
      for (const p of invoice.payments) {
        if (!existingPaymentIds.has(toDb(p.id))) {
          insertPayment.run(toDb(p.id), rawId, p.amount.cents.toString(), p.recordedAt.toISOString());
        }
      }

      return ok(undefined);
    });
  }

  list(filters?: { status?: InvoiceStatus; clientId?: ClientId }): readonly Invoice[] {
    let where = '';
    const params: unknown[] = [];
    const conditions: string[] = [];

    if (filters?.status) {
      conditions.push('i.status = ?');
      params.push(filters.status);
    }
    if (filters?.clientId) {
      conditions.push('i.client_id = ?');
      params.push(toDb(filters.clientId));
    }

    if (conditions.length > 0) {
      where = ' WHERE ' + conditions.join(' AND ');
    }

    const sql = `
      SELECT i.*,
        (SELECT json_group_array(json_object(
          'id', li.id, 'invoice_id', li.invoice_id,
          'description', li.description, 'quantity', li.quantity,
          'unit_price_cents', li.unit_price_cents
        )) FROM line_items li WHERE li.invoice_id = i.id) AS line_items_json,
        (SELECT json_group_array(json_object(
          'id', p.id, 'invoice_id', p.invoice_id,
          'amount_cents', p.amount_cents, 'recorded_at', p.recorded_at
        )) FROM payments p WHERE p.invoice_id = i.id ORDER BY p.recorded_at) AS payments_json
      FROM invoices i${where}
      ORDER BY i.created_at DESC`;

    const rows = this.db.prepare<InvoiceWithChildrenRow>(sql).all(...params);

    return rows.map((row) => {
      const lineItems: LineItemRow[] = JSON.parse(row.line_items_json);
      const payments: PaymentRow[] = JSON.parse(row.payments_json);
      // json_group_array returns [null] for empty sets
      const validLineItems = lineItems.filter((li) => li.id !== null);
      const validPayments = payments.filter((p) => p.id !== null);
      return toInvoice(row, validLineItems.map(toLineItem), validPayments.map(toPayment));
    });
  }

  listSummaries(filters?: { status?: InvoiceStatus; clientId?: ClientId }): readonly InvoiceListItem[] {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (filters?.status) {
      conditions.push('i.status = ?');
      params.push(filters.status);
    }
    if (filters?.clientId) {
      conditions.push('i.client_id = ?');
      params.push(toDb(filters.clientId));
    }

    const where = conditions.length > 0 ? ' WHERE ' + conditions.join(' AND ') : '';

    const sql = `
      SELECT
        i.*,
        COALESCE((SELECT COUNT(*) FROM line_items li WHERE li.invoice_id = i.id), 0) AS line_item_count,
        (SELECT SUM(CAST(li.unit_price_cents AS INTEGER) * li.quantity) FROM line_items li WHERE li.invoice_id = i.id) AS subtotal_cents,
        (SELECT SUM(CAST(p.amount_cents AS INTEGER)) FROM payments p WHERE p.invoice_id = i.id) AS paid_amount_cents
      FROM invoices i${where}
      ORDER BY i.created_at DESC`;

    const rows = this.db.prepare<SummaryRow>(sql).all(...params);

    return rows.map((row): InvoiceListItem => ({
      id: fromDb('inv', row.id),
      clientId: fromDb('client', row.client_id),
      status: row.status as InvoiceStatus,
      taxRate: row.tax_rate as TaxRate,
      dueDate: row.due_date as DueDate,
      createdAt: new Date(row.created_at),
      lineItemCount: row.line_item_count,
      subtotalCents: BigInt(row.subtotal_cents ?? '0'),
      paidAmountCents: BigInt(row.paid_amount_cents ?? '0'),
    }));
  }
}
