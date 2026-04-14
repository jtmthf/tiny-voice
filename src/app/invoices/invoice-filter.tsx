'use client';

import { useRouter, useSearchParams } from 'next/navigation';

const STATUSES = ['all', 'draft', 'sent', 'paid', 'void'] as const;

export function InvoiceFilter({ current }: { current: string | undefined }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    const params = new URLSearchParams(searchParams.toString());
    if (value === 'all') {
      params.delete('status');
    } else {
      params.set('status', value);
    }
    router.push(`/invoices?${params.toString()}`);
  };

  return (
    <div style={{ margin: '1rem 0' }}>
      <label htmlFor="status-filter" style={{ marginRight: '0.5rem', fontSize: '0.875rem', fontWeight: 500 }}>
        Filter by status:
      </label>
      <select id="status-filter" value={current ?? 'all'} onChange={handleChange}>
        {STATUSES.map((s) => (
          <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
        ))}
      </select>
    </div>
  );
}
