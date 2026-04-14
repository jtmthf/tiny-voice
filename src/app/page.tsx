import Link from 'next/link';
import { cacheTag } from 'next/cache';
import { app } from '@/app/app';
import { formatMoney } from '@/app/lib/format-money';
import { formatDate } from '@/app/lib/format-date';
import { Money } from '@/shared/money/money';

async function getCachedInvoiceSummaries() {
  'use cache';
  cacheTag('invoices');
  return app.queries.invoicing.listInvoices();
}

async function RecentInvoices() {
  const invoices = await getCachedInvoiceSummaries();
  const recent = invoices.slice(0, 10);

  if (recent.length === 0) {
    return <p className="empty">No invoices yet. <Link href="/invoices/new">Create one</Link>.</p>;
  }

  return (
    <table>
      <thead>
        <tr>
          <th>Invoice</th>
          <th>Status</th>
          <th>Total</th>
          <th>Outstanding</th>
          <th>Created</th>
        </tr>
      </thead>
      <tbody>
        {recent.map((inv) => (
          <tr key={inv.id}>
            <td><Link href={`/invoices/${inv.id}`}>{inv.id.slice(0, 8)}...<span className="sr-only">, {inv.status}, {formatMoney(inv.total)}</span></Link></td>
            <td><span className={`badge badge-${inv.status}`}>{inv.status}</span></td>
            <td>{formatMoney(inv.total)}</td>
            <td>{formatMoney(inv.outstandingBalance)}</td>
            <td>{formatDate(inv.createdAt)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

async function ClientSummary() {
  'use cache';
  cacheTag('clients');

  const clients = await app.queries.clients.listClients();

  return (
    <div className="stat-card">
      <div className="label">Clients</div>
      <div className="value">{clients.length}</div>
    </div>
  );
}

async function InvoiceSummary() {
  const invoices = await getCachedInvoiceSummaries();
  const sent = invoices.filter((i) => i.status === 'sent');
  const totalOutstandingCents = sent.reduce((sum, inv) => sum + inv.outstandingBalance.cents, 0n);
  const totalOutstanding = Money.fromCents(totalOutstandingCents);

  return (
    <>
      <div className="stat-card">
        <div className="label">Total Invoices</div>
        <div className="value">{invoices.length}</div>
      </div>
      <div className="stat-card">
        <div className="label">Outstanding</div>
        <div className="value">{formatMoney(totalOutstanding)}</div>
      </div>
    </>
  );
}

export default function HomePage() {
  return (
    <>
      <h1>Dashboard</h1>
      <div className="grid-stats" style={{ marginTop: '1rem' }}>
        <ClientSummary />
        <InvoiceSummary />
      </div>
      <h2 style={{ marginTop: '1.5rem' }}>Recent Invoices</h2>
      <RecentInvoices />
    </>
  );
}
