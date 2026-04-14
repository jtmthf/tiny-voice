import Link from 'next/link';
import { cacheTag } from 'next/cache';
import { app } from '@/app/instance';
import { formatMoney } from '@/app/lib/format-money';
import { formatDate } from '@/app/lib/format-date';

async function RecentInvoices() {
  'use cache';
  cacheTag('invoices');

  const invoices = await app.queries.invoicing.listInvoices();
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
            <td><Link href={`/invoices/${inv.id}`}>{inv.id.slice(0, 8)}...</Link></td>
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
  'use cache';
  cacheTag('invoices');

  const invoices = await app.queries.invoicing.listInvoices();
  const sent = invoices.filter((i) => i.status === 'sent');
  let totalOutstanding = '$0.00';
  if (sent.length > 0) {
    // Sum outstanding from all sent invoices
    let cents = 0n;
    for (const inv of sent) {
      cents += inv.outstandingBalance.cents;
    }
    const sign = cents < 0n ? '-' : '';
    const abs = cents < 0n ? -cents : cents;
    totalOutstanding = `${sign}$${abs / 100n}.${(abs % 100n).toString().padStart(2, '0')}`;
  }

  return (
    <>
      <div className="stat-card">
        <div className="label">Total Invoices</div>
        <div className="value">{invoices.length}</div>
      </div>
      <div className="stat-card">
        <div className="label">Outstanding</div>
        <div className="value">{totalOutstanding}</div>
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
