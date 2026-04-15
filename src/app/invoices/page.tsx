import Link from 'next/link';
import { cacheTag } from 'next/cache';
import { app } from '@/app/app';
import { Money } from '@/shared/money/money';
import { formatDate } from '@/app/lib/format-date';
import type { InvoiceStatus } from '@/invoicing/value-objects/invoice-status';
import { InvoiceFilter } from './invoice-filter';

async function InvoiceList({ status }: { status: string | undefined }) {
  'use cache';
  cacheTag('invoices');

  const filters = status && status !== 'all' ? { status: status as InvoiceStatus } : undefined;
  const invoices = await app.queries.invoicing.listInvoices(filters);

  if (invoices.length === 0) {
    return <p className="empty">No invoices found.</p>;
  }

  return (
    <table>
      <thead>
        <tr>
          <th>Invoice</th>
          <th>Status</th>
          <th>Items</th>
          <th>Total</th>
          <th>Outstanding</th>
          <th>Due Date</th>
          <th>Created</th>
        </tr>
      </thead>
      <tbody>
        {invoices.map((inv) => (
          <tr key={inv.id}>
            <td><Link href={`/invoices/${inv.id}`}>{inv.id.slice(0, 8)}...<span className="sr-only">, {inv.status}, {Money.toDisplayString(inv.total)}</span></Link></td>
            <td><span className={`badge badge-${inv.status}`}>{inv.status}</span></td>
            <td>{inv.lineItemCount}</td>
            <td>{Money.toDisplayString(inv.total)}</td>
            <td>{Money.toDisplayString(inv.outstandingBalance)}</td>
            <td>{inv.dueDate}</td>
            <td>{formatDate(inv.createdAt)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default async function InvoicesPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status } = await searchParams;

  return (
    <>
      <div className="flex-between">
        <h1>Invoices</h1>
        <Link href="/invoices/new" className="btn btn-primary">New Invoice</Link>
      </div>
      <InvoiceFilter current={status} />
      <InvoiceList status={status} />
    </>
  );
}
