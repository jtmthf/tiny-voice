import { createFileRoute, Link } from '@tanstack/react-router';
import { useSuspenseQuery, useQueryClient } from '@tanstack/react-query';
import { invoiceDetailQueryOptions } from '@/app/queries/invoice-queries';
import { InvoiceActions } from '@/app/invoices/invoice-actions';
import { formatDate } from '@/app/lib/format-date';
import { Money } from '@/shared/money/money';
import { isOverdue as isDueDateOverdue } from '@/shared/time/due-date';
import type { DueDate } from '@/shared/time/due-date';
import type { LineItemDto } from '@/app/fns/dto';

export const Route = createFileRoute('/invoices/$id')({
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(invoiceDetailQueryOptions(params.id)),
  component: InvoiceDetailPage,
});

function lineTotal(li: LineItemDto): ReturnType<typeof Money.fromCents> {
  return Money.fromCents(BigInt(li.unitPrice.cents) * BigInt(li.quantity));
}

function InvoiceDetailPage() {
  const { id } = Route.useParams();
  const queryClient = useQueryClient();
  const { data } = useSuspenseQuery(invoiceDetailQueryOptions(id));

  if (!data.summary) return <p>Invoice not found.</p>;

  const { summary, lineItems, payments, clientName } = data;
  const today = new Date().toISOString().slice(0, 10) as DueDate;
  const showLateFeeButton = summary.status === 'sent' && isDueDateOverdue(summary.dueDate as DueDate, today);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['invoices'] });
  };

  return (
    <>
      <Link to="/invoices" search={{ status: undefined }} className="text-sm">&larr; Back to invoices</Link>
      <div className="mt-md">
        <div className="card">
          <div className="flex-between">
            <h2>Invoice {summary.id.slice(0, 8)}...</h2>
            <span role="status" className={`badge badge-${summary.status}`}>{summary.status}</span>
          </div>
          <div className="grid-stats mt-md">
            <div>
              <span className="text-muted text-sm">Subtotal</span>
              <div className="font-semibold">{Money.toDisplayString(Money.fromCents(BigInt(summary.subtotal.cents)))}</div>
            </div>
            <div>
              <span className="text-muted text-sm">Tax</span>
              <div className="font-semibold">{Money.toDisplayString(Money.fromCents(BigInt(summary.taxAmount.cents)))}</div>
            </div>
            <div>
              <span className="text-muted text-sm">Total</span>
              <div className="font-semibold">{Money.toDisplayString(Money.fromCents(BigInt(summary.total.cents)))}</div>
            </div>
            <div>
              <span className="text-muted text-sm">Paid</span>
              <div className="font-semibold">{Money.toDisplayString(Money.fromCents(BigInt(summary.paidAmount.cents)))}</div>
            </div>
            <div>
              <span className="text-muted text-sm">Outstanding</span>
              <div className="font-semibold">{Money.toDisplayString(Money.fromCents(BigInt(summary.outstandingBalance.cents)))}</div>
            </div>
          </div>
          <div className="mt-sm text-muted text-sm">
            Due: {summary.dueDate} &middot; Created: {formatDate(new Date(summary.createdAt))} &middot; {summary.lineItemCount} line item{summary.lineItemCount !== 1 ? 's' : ''}
          </div>
        </div>

        {clientName && (
          <p className="text-muted text-sm">
            Client: {clientName}
          </p>
        )}

        <InvoiceActions
          invoiceId={id}
          status={summary.status}
          showLateFeeButton={showLateFeeButton}
          onSuccess={invalidate}
        />

        <h2 className="mt-lg">Line Items</h2>
        {!lineItems || lineItems.length === 0 ? (
          <p className="empty">No line items.</p>
        ) : (
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
                  <td>{Money.toDisplayString(Money.fromCents(BigInt(li.unitPrice.cents)))}</td>
                  <td>{Money.toDisplayString(lineTotal(li))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <h2 className="mt-lg">Payments</h2>
        {!payments || payments.length === 0 ? (
          <p className="empty">No payments recorded.</p>
        ) : (
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
                  <td>{Money.toDisplayString(Money.fromCents(BigInt(p.amount.cents)))}</td>
                  <td>{formatDate(new Date(p.recordedAt))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
