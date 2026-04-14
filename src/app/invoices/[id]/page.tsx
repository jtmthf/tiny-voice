import Link from 'next/link';
import { notFound } from 'next/navigation';
import { cacheTag } from 'next/cache';
import { app } from '@/app/instance';
import { formatMoney } from '@/app/lib/format-money';
import { formatDate } from '@/app/lib/format-date';
import { parseInvoiceId } from '@/shared/ids/invoice-id';
import { isOverdue } from '@/invoicing/index';
import type { DueDate } from '@/shared/time/due-date';
import { InvoiceActions } from './invoice-actions';

async function InvoiceHeader({ id }: { id: string }) {
  'use cache';
  cacheTag('invoices', `invoice:${id}`);

  const summary = await app.queries.invoicing.getInvoiceSummary(parseInvoiceId(id));
  if (!summary) return null;

  return (
    <div className="card">
      <div className="flex-between">
        <h2>Invoice {summary.id.slice(0, 8)}...</h2>
        <span className={`badge badge-${summary.status}`}>{summary.status}</span>
      </div>
      <div className="grid-stats" style={{ marginTop: '1rem' }}>
        <div>
          <span style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>Subtotal</span>
          <div style={{ fontWeight: 600 }}>{formatMoney(summary.subtotal)}</div>
        </div>
        <div>
          <span style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>Tax</span>
          <div style={{ fontWeight: 600 }}>{formatMoney(summary.taxAmount)}</div>
        </div>
        <div>
          <span style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>Total</span>
          <div style={{ fontWeight: 600 }}>{formatMoney(summary.total)}</div>
        </div>
        <div>
          <span style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>Paid</span>
          <div style={{ fontWeight: 600 }}>{formatMoney(summary.paidAmount)}</div>
        </div>
        <div>
          <span style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>Outstanding</span>
          <div style={{ fontWeight: 600 }}>{formatMoney(summary.outstandingBalance)}</div>
        </div>
      </div>
      <div style={{ marginTop: '0.5rem', color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>
        Due: {summary.dueDate} &middot; Created: {formatDate(summary.createdAt)} &middot; {summary.lineItemCount} line item{summary.lineItemCount !== 1 ? 's' : ''}
      </div>
    </div>
  );
}

async function InvoiceClientInfo({ id }: { id: string }) {
  'use cache';
  cacheTag('invoices', 'clients');

  const summary = await app.queries.invoicing.getInvoiceSummary(parseInvoiceId(id));
  if (!summary) return null;

  const client = await app.queries.clients.getClient(summary.clientId);
  if (!client) return <p style={{ color: 'var(--color-text-muted)' }}>Client not found</p>;

  return (
    <p style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>
      Client: <Link href={`/clients/${client.id}`}>{client.name}</Link> ({String(client.email)})
    </p>
  );
}

async function InvoiceLineItems({ id }: { id: string }) {
  'use cache';
  cacheTag('invoices', `invoice:${id}`);

  const invoice = await app.invoiceRepo.findById(parseInvoiceId(id));
  if (!invoice) return null;

  if (invoice.lineItems.length === 0) {
    return <p className="empty">No line items.</p>;
  }

  return (
    <table>
      <thead>
        <tr>
          <th>Description</th>
          <th>Qty</th>
          <th>Unit Price</th>
          <th>Total</th>
        </tr>
      </thead>
      <tbody>
        {invoice.lineItems.map((li) => (
          <tr key={li.id}>
            <td>{li.description}</td>
            <td>{li.quantity}</td>
            <td>{formatMoney(li.unitPrice)}</td>
            <td>{formatMoney({ cents: li.unitPrice.cents * BigInt(li.quantity), currency: 'USD' })}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

async function InvoicePayments({ id }: { id: string }) {
  'use cache';
  cacheTag('invoices', `invoice:${id}`);

  const invoice = await app.invoiceRepo.findById(parseInvoiceId(id));
  if (!invoice) return null;

  if (invoice.payments.length === 0) {
    return <p className="empty">No payments recorded.</p>;
  }

  return (
    <table>
      <thead>
        <tr>
          <th>Payment</th>
          <th>Amount</th>
          <th>Date</th>
        </tr>
      </thead>
      <tbody>
        {invoice.payments.map((p) => (
          <tr key={p.id}>
            <td>{p.id.slice(0, 8)}...</td>
            <td>{formatMoney(p.amount)}</td>
            <td>{formatDate(p.recordedAt)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

async function getInvoiceStatus(id: string): Promise<string | null> {
  const summary = await app.queries.invoicing.getInvoiceSummary(parseInvoiceId(id));
  return summary?.status ?? null;
}

export default async function InvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const summary = await app.queries.invoicing.getInvoiceSummary(parseInvoiceId(id));
  if (!summary) notFound();

  const status = await getInvoiceStatus(id);
  const lateFeesEnabled = app.featureFlags.isEnabled('lateFees');
  const invoice = await app.invoiceRepo.findById(parseInvoiceId(id));
  const invoiceIsOverdue = invoice ? isOverdue(invoice, app.clock.today() as DueDate) : false;
  const showLateFeeButton = lateFeesEnabled && invoiceIsOverdue;

  return (
    <>
      <Link href="/invoices" style={{ fontSize: '0.85rem' }}>&larr; Back to invoices</Link>
      <div style={{ marginTop: '1rem' }}>
        <InvoiceHeader id={id} />
        <InvoiceClientInfo id={id} />

        <InvoiceActions invoiceId={id} status={status ?? 'draft'} showLateFeeButton={showLateFeeButton} />

        <h2 style={{ marginTop: '1.5rem' }}>Line Items</h2>
        <InvoiceLineItems id={id} />

        <h2 style={{ marginTop: '1.5rem' }}>Payments</h2>
        <InvoicePayments id={id} />
      </div>
    </>
  );
}
