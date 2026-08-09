import { createFileRoute, Link } from '@tanstack/react-router';
import { useSuspenseQuery } from '@tanstack/react-query';
import { invoicesQueryOptions } from '@/app/queries/invoice-queries';
import { InvoiceFilter } from '@/app/invoices/invoice-filter';
import { formatDate } from '@/app/lib/format-date';
import { Money } from '@/shared/money/money';

export const Route = createFileRoute('/invoices/')({
  validateSearch: (search: Record<string, unknown>) => ({
    status: typeof search['status'] === 'string' ? search['status'] : undefined,
  }),
  loaderDeps: ({ search: { status } }) => ({ status }),
  loader: ({ context, deps }) =>
    context.queryClient.ensureQueryData(invoicesQueryOptions(deps.status)),
  component: InvoicesPage,
});

function InvoicesPage() {
  const { status } = Route.useSearch();
  const { data: invoices } = useSuspenseQuery(invoicesQueryOptions(status));

  return (
    <>
      <div className="flex-between">
        <h1>Invoices</h1>
        <Link to="/invoices/new" className="btn btn-primary">
          New Invoice
        </Link>
      </div>
      <InvoiceFilter current={status} />
      {invoices.length === 0 ? (
        <p role="status" className="empty">
          No invoices found.
        </p>
      ) : (
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
                <td>
                  <Link to="/invoices/$id" params={{ id: inv.id }}>
                    {inv.id.slice(0, 8)}...
                    <span className="sr-only">
                      , {inv.status},{' '}
                      {Money.toDisplayString(Money.fromCents(BigInt(inv.total.cents)))}
                    </span>
                  </Link>
                </td>
                <td>
                  <strong className={`badge badge-${inv.status}`}>{inv.status}</strong>
                </td>
                <td>{inv.lineItemCount}</td>
                <td>{Money.toDisplayString(Money.fromCents(BigInt(inv.total.cents)))}</td>
                <td>
                  {Money.toDisplayString(Money.fromCents(BigInt(inv.outstandingBalance.cents)))}
                </td>
                <td>{inv.dueDate}</td>
                <td>{formatDate(new Date(inv.createdAt))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
