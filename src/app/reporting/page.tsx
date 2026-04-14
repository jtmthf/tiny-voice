import { cacheTag } from 'next/cache';
import { app } from '@/app/app';
import { formatMoney } from '@/app/lib/format-money';
import { formatDate } from '@/app/lib/format-date';

async function AllRevenue() {
  'use cache';
  cacheTag('revenue');

  const revenue = await app.queries.reporting.listAllRevenue();

  if (revenue.length === 0) {
    return <p className="empty">No revenue recorded yet.</p>;
  }

  return (
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
            <td>{formatMoney(r.total)}</td>
            <td>{r.paymentCount}</td>
            <td>{formatDate(r.updatedAt)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

async function YearRevenue() {
  'use cache';
  cacheTag('revenue');

  const currentYear = new Date().getFullYear();
  const yearRevenue = await app.queries.reporting.getRevenueByYear(currentYear);

  if (yearRevenue.length === 0) {
    return <p className="empty">No revenue for {currentYear}.</p>;
  }

  let totalCents = 0n;
  let totalPayments = 0;
  for (const r of yearRevenue) {
    totalCents += r.total.cents;
    totalPayments += r.paymentCount;
  }

  return (
    <div className="grid-stats">
      <div className="stat-card">
        <div className="label">{currentYear} Revenue</div>
        <div className="value">{formatMoney({ cents: totalCents, currency: 'USD' })}</div>
      </div>
      <div className="stat-card">
        <div className="label">{currentYear} Payments</div>
        <div className="value">{totalPayments}</div>
      </div>
    </div>
  );
}

export default function ReportingPage() {
  return (
    <>
      <h1>Revenue Reporting</h1>
      <div style={{ marginTop: '1rem' }}>
        <YearRevenue />
      </div>
      <h2 style={{ marginTop: '1.5rem' }}>Revenue by Month</h2>
      <AllRevenue />
    </>
  );
}
