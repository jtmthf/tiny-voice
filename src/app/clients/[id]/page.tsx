import Link from 'next/link';
import { notFound } from 'next/navigation';
import { cacheTag } from 'next/cache';
import { app } from '@/app/app';
import { formatDate } from '@/app/lib/format-date';
import { formatMoney } from '@/app/lib/format-money';
import { parseClientId } from '@/shared/ids/client-id';

async function ClientDetail({ id }: { id: string }) {
  'use cache';
  cacheTag('clients');

  const client = await app.queries.clients.getClient(parseClientId(id));
  if (!client) return null;

  return (
    <div className="card">
      <h2>{client.name}</h2>
      <p style={{ color: 'var(--color-text-muted)' }}>{String(client.email)}</p>
      <p style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>
        Created {formatDate(client.createdAt)}
      </p>
    </div>
  );
}

async function ClientInvoices({ clientId }: { clientId: string }) {
  'use cache';
  cacheTag('invoices');

  const invoices = await app.queries.invoicing.listInvoices({ clientId: parseClientId(clientId) });

  if (invoices.length === 0) {
    return <p className="empty">No invoices for this client.</p>;
  }

  return (
    <table>
      <thead>
        <tr>
          <th>Invoice</th>
          <th>Status</th>
          <th>Total</th>
          <th>Outstanding</th>
          <th>Due Date</th>
        </tr>
      </thead>
      <tbody>
        {invoices.map((inv) => (
          <tr key={inv.id}>
            <td><Link href={`/invoices/${inv.id}`}>{inv.id.slice(0, 8)}...<span className="sr-only">, {inv.status}, {formatMoney(inv.total)}</span></Link></td>
            <td><span className={`badge badge-${inv.status}`}>{inv.status}</span></td>
            <td>{formatMoney(inv.total)}</td>
            <td>{formatMoney(inv.outstandingBalance)}</td>
            <td>{inv.dueDate}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

async function OutstandingBalance({ clientId }: { clientId: string }) {
  'use cache';
  cacheTag('invoices');

  const outstanding = await app.queries.invoicing.getOutstandingByClient(parseClientId(clientId));

  return (
    <div className="stat-card">
      <div className="label">Outstanding Balance</div>
      <div className="value">{formatMoney(outstanding)}</div>
    </div>
  );
}

export default async function ClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const client = await app.queries.clients.getClient(parseClientId(id));
  if (!client) notFound();

  return (
    <>
      <Link href="/clients" style={{ fontSize: '0.85rem' }}>&larr; Back to clients</Link>
      <div style={{ marginTop: '1rem' }}>
        <ClientDetail id={id} />
        <div className="grid-stats" style={{ marginTop: '1rem' }}>
          <OutstandingBalance clientId={id} />
        </div>
        <h2 style={{ marginTop: '1.5rem' }}>Invoices</h2>
        <ClientInvoices clientId={id} />
      </div>
    </>
  );
}
