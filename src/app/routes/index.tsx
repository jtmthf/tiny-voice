import { createFileRoute, Link } from '@tanstack/react-router';
import { useSuspenseQuery } from '@tanstack/react-query';
import { clientsQueryOptions } from '@/app/queries/client-queries';
import { invoicesQueryOptions } from '@/app/queries/invoice-queries';
import { formatDate } from '@/app/lib/format-date';
import { Money } from '@/shared/money/money';
import type { InvoiceSummaryDto } from '@/app/fns/dto';

export const Route = createFileRoute('/')({
  loader: ({ context }) => Promise.all([
    context.queryClient.ensureQueryData(clientsQueryOptions()),
    context.queryClient.ensureQueryData(invoicesQueryOptions()),
  ]),
  component: HomePage,
});

function HomePage() {
  const { data: clients } = useSuspenseQuery(clientsQueryOptions());
  const { data: invoices } = useSuspenseQuery(invoicesQueryOptions());
  const recent = invoices.slice(0, 10);
  const sent = invoices.filter((i) => i.status === 'sent');
  const totalOutstandingCents = sent.reduce((sum, inv) => sum + BigInt(inv.outstandingBalance.cents), 0n);
  const totalOutstanding = Money.fromCents(totalOutstandingCents);

  return (
    <>
      <h1>Dashboard</h1>
      <div className="grid-stats mt-md">
        <div className="stat-card">
          <div className="label">Clients</div>
          <div className="value">{clients.length}</div>
        </div>
        <div className="stat-card">
          <div className="label">Total Invoices</div>
          <div className="value">{invoices.length}</div>
        </div>
        <div className="stat-card">
          <div className="label">Outstanding</div>
          <div className="value">{Money.toDisplayString(totalOutstanding)}</div>
        </div>
      </div>
      <h2 className="mt-lg">Recent Invoices</h2>
      <RecentInvoices invoices={recent} />
    </>
  );
}

function RecentInvoices({ invoices }: { invoices: InvoiceSummaryDto[] }) {
  if (invoices.length === 0) {
    return <p className="empty">No invoices yet. <Link to="/invoices/new">Create one</Link>.</p>;
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
        {invoices.map((inv) => (
          <tr key={inv.id}>
            <td>
              <Link to="/invoices/$id" params={{ id: inv.id }}>
                {inv.id.slice(0, 8)}...<span className="sr-only">, {inv.status}, {Money.toDisplayString(Money.fromCents(BigInt(inv.total.cents)))}</span>
              </Link>
            </td>
            <td><span className={`badge badge-${inv.status}`}>{inv.status}</span></td>
            <td>{Money.toDisplayString(Money.fromCents(BigInt(inv.total.cents)))}</td>
            <td>{Money.toDisplayString(Money.fromCents(BigInt(inv.outstandingBalance.cents)))}</td>
            <td>{formatDate(new Date(inv.createdAt))}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
