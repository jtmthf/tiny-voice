import Link from 'next/link';
import { notFound } from 'next/navigation';
import { cacheTag } from 'next/cache';
import { app } from '@/app/app';
import { Money } from '@/shared/money/money';
import { formatDate } from '@/app/lib/format-date';
import { lineTotal } from '@/invoicing/entities/line-item';
import { parseInvoiceId } from '@/shared/ids/invoice-id';
import { isOverdue as isDueDateOverdue } from '@/shared/time/due-date';
import type { DueDate } from '@/shared/time/due-date';
import { InvoiceActions } from './invoice-actions';

// ---------------------------------------------------------------------------
// Data-level cached queries — shared across all components on this page
// ---------------------------------------------------------------------------

async function getCachedInvoiceSummary(id: string) {
  'use cache';
  cacheTag('invoices', `invoice:${id}`);
  return app.queries.invoicing.getInvoiceSummary(parseInvoiceId(id));
}

async function getCachedLineItems(id: string) {
  'use cache';
  cacheTag('invoices', `invoice:${id}`);
  return app.queries.invoicing.getInvoiceLineItems(parseInvoiceId(id));
}

async function getCachedPayments(id: string) {
  'use cache';
  cacheTag('invoices', `invoice:${id}`);
  return app.queries.invoicing.getInvoicePayments(parseInvoiceId(id));
}

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

async function InvoiceHeader({ id }: { id: string }) {
  const summary = await getCachedInvoiceSummary(id);
  if (!summary) return null;

  return (
    <div className="card">
      <div className="flex-between">
        <h2>Invoice {summary.id.slice(0, 8)}...</h2>
        <span className={`badge badge-${summary.status}`}>{summary.status}</span>
      </div>
      <div className="grid-stats mt-md">
        <div>
          <span className="text-muted text-sm">Subtotal</span>
          <div className="font-semibold">{Money.toDisplayString(summary.subtotal)}</div>
        </div>
        <div>
          <span className="text-muted text-sm">Tax</span>
          <div className="font-semibold">{Money.toDisplayString(summary.taxAmount)}</div>
        </div>
        <div>
          <span className="text-muted text-sm">Total</span>
          <div className="font-semibold">{Money.toDisplayString(summary.total)}</div>
        </div>
        <div>
          <span className="text-muted text-sm">Paid</span>
          <div className="font-semibold">{Money.toDisplayString(summary.paidAmount)}</div>
        </div>
        <div>
          <span className="text-muted text-sm">Outstanding</span>
          <div className="font-semibold">{Money.toDisplayString(summary.outstandingBalance)}</div>
        </div>
      </div>
      <div className="mt-sm text-muted text-sm">
        Due: {summary.dueDate} &middot; Created: {formatDate(summary.createdAt)} &middot; {summary.lineItemCount} line item{summary.lineItemCount !== 1 ? 's' : ''}
      </div>
    </div>
  );
}

async function InvoiceClientInfo({ id }: { id: string }) {
  'use cache';
  cacheTag('invoices', 'clients');

  const summary = await getCachedInvoiceSummary(id);
  if (!summary) return null;

  const client = await app.queries.clients.getClient(summary.clientId);
  if (!client) return <p className="text-muted">Client not found</p>;

  return (
    <p className="text-muted text-sm">
      Client: <Link href={`/clients/${client.id}`}>{client.name}</Link> ({String(client.email)})
    </p>
  );
}

async function InvoiceLineItems({ id }: { id: string }) {
  const lineItems = await getCachedLineItems(id);
  if (!lineItems) return null;

  if (lineItems.length === 0) {
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
        {lineItems.map((li) => (
          <tr key={li.id}>
            <td>{li.description}</td>
            <td>{li.quantity}</td>
            <td>{Money.toDisplayString(li.unitPrice)}</td>
            <td>{Money.toDisplayString(lineTotal(li))}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

async function InvoicePayments({ id }: { id: string }) {
  const payments = await getCachedPayments(id);
  if (!payments) return null;

  if (payments.length === 0) {
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
        {payments.map((p) => (
          <tr key={p.id}>
            <td>{p.id.slice(0, 8)}...</td>
            <td>{Money.toDisplayString(p.amount)}</td>
            <td>{formatDate(p.recordedAt)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default async function InvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const summary = await getCachedInvoiceSummary(id);
  if (!summary) notFound();

  const lateFeesEnabled = app.featureFlags.isEnabled('lateFees');
  const showLateFeeButton = lateFeesEnabled
    && summary.status === 'sent'
    && isDueDateOverdue(summary.dueDate, app.clock.today() as DueDate);

  return (
    <>
      <Link href="/invoices" className="text-sm">&larr; Back to invoices</Link>
      <div className="mt-md">
        <InvoiceHeader id={id} />
        <InvoiceClientInfo id={id} />

        <InvoiceActions invoiceId={id} status={summary.status} showLateFeeButton={showLateFeeButton} />

        <h2 className="mt-lg">Line Items</h2>
        <InvoiceLineItems id={id} />

        <h2 className="mt-lg">Payments</h2>
        <InvoicePayments id={id} />
      </div>
    </>
  );
}
