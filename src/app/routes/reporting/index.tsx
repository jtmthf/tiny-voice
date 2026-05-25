import { createFileRoute } from '@tanstack/react-router';
import { useSuspenseQuery } from '@tanstack/react-query';
import { revenueQueryOptions } from '@/app/queries/revenue-queries';
import { formatDate } from '@/app/lib/format-date';
import { Money } from '@/shared/money/money';

export const Route = createFileRoute('/reporting/')({
  loader: ({ context }) => context.queryClient.ensureQueryData(revenueQueryOptions()),
  component: ReportingPage,
});

function ReportingPage() {
  const { data: revenue } = useSuspenseQuery(revenueQueryOptions());

  const currentYear = new Date().getFullYear();
  const yearRevenue = revenue.filter((r) => r.month.startsWith(String(currentYear)));
  const totalCents = yearRevenue.reduce((sum, r) => sum + BigInt(r.total.cents), 0n);
  const totalPayments = yearRevenue.reduce((sum, r) => sum + r.paymentCount, 0);

  return (
    <>
      <h1>Revenue Reporting</h1>
      <div className="mt-md">
        {yearRevenue.length === 0 ? (
          <p role="status" className="empty">No revenue for {currentYear}.</p>
        ) : (
          <div className="grid-stats">
            <div className="stat-card">
              <div className="label">{currentYear} Revenue</div>
              <div className="value">{Money.toDisplayString(Money.fromCents(totalCents))}</div>
            </div>
            <div className="stat-card">
              <div className="label">{currentYear} Payments</div>
              <div className="value">{totalPayments}</div>
            </div>
          </div>
        )}
      </div>
      <h2 className="mt-lg">Revenue by Month</h2>
      {revenue.length === 0 ? (
        <p role="status" className="empty">No revenue recorded yet.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Month</th>
              <th>Total Revenue</th>
              <th>Payments</th>
              <th>Last Updated</th>
            </tr>
          </thead>
          <tbody>
            {revenue.map((r) => (
              <tr key={r.month}>
                <td>{r.month}</td>
                <td>{Money.toDisplayString(Money.fromCents(BigInt(r.total.cents)))}</td>
                <td>{r.paymentCount}</td>
                <td>{formatDate(new Date(r.updatedAt))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
