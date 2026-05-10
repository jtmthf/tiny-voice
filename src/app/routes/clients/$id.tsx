import { createFileRoute, Link } from '@tanstack/react-router';
import { useSuspenseQuery } from '@tanstack/react-query';
import { clientQueryOptions, outstandingByClientQueryOptions, clientInvoicesQueryOptions } from '@/app/queries/client-queries';
import { formatDate } from '@/app/lib/format-date';
import { Money } from '@/shared/money/money';

export const Route = createFileRoute('/clients/$id')({
  loader: ({ context, params }) => Promise.all([
    context.queryClient.ensureQueryData(clientQueryOptions(params.id)),
    context.queryClient.ensureQueryData(outstandingByClientQueryOptions(params.id)),
    context.queryClient.ensureQueryData(clientInvoicesQueryOptions(params.id)),
  ]),
  component: ClientDetailPage,
});

function ClientDetailPage() {
  const { id } = Route.useParams();
  const { data: client } = useSuspenseQuery(clientQueryOptions(id));
  const { data: outstanding } = useSuspenseQuery(outstandingByClientQueryOptions(id));
  const { data: invoices } = useSuspenseQuery(clientInvoicesQueryOptions(id));

  if (!client) return <p>Client not found.</p>;

  return (
    <>
      <Link to="/clients" className="text-sm">&larr; Back to clients</Link>
      <div className="mt-md">
        <div className="card">
          <h2>{client.name}</h2>
          <p className="text-muted">{client.email}</p>
          <p className="text-muted text-sm">Created {formatDate(new Date(client.createdAt))}</p>
        </div>
        <div className="grid-stats mt-md">
          <div className="stat-card">
            <div className="label">Outstanding Balance</div>
            <div className="value">{Money.toDisplayString(Money.fromCents(BigInt(outstanding.cents)))}</div>
          </div>
        </div>
        <h2 className="mt-lg">Invoices</h2>
        {invoices.length === 0 ? (
          <p className="empty">No invoices for this client.</p>
        ) : (
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
                  <td>
                    <Link to="/invoices/$id" params={{ id: inv.id }}>
                      {inv.id.slice(0, 8)}...<span className="sr-only">, {inv.status}, {Money.toDisplayString(Money.fromCents(BigInt(inv.total.cents)))}</span>
                    </Link>
                  </td>
                  <td><span className={`badge badge-${inv.status}`}>{inv.status}</span></td>
                  <td>{Money.toDisplayString(Money.fromCents(BigInt(inv.total.cents)))}</td>
                  <td>{Money.toDisplayString(Money.fromCents(BigInt(inv.outstandingBalance.cents)))}</td>
                  <td>{inv.dueDate}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
