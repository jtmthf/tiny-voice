import { useNavigate } from '@tanstack/react-router';

const STATUSES = ['all', 'draft', 'sent', 'paid', 'void'] as const;

export function InvoiceFilter({ current }: { current: string | undefined }) {
  const navigate = useNavigate({ from: '/invoices/' });
  const currentStatus = current ?? 'all';

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    void navigate({
      search: (prev) => ({ ...prev, status: value === 'all' ? undefined : value }),
    });
  };

  return (
    <div className="filter-row">
      <label htmlFor="status-filter">Filter by status:</label>
      <select id="status-filter" value={currentStatus} onChange={handleChange}>
        {STATUSES.map((s) => (
          <option key={s} value={s}>
            {s.charAt(0).toUpperCase() + s.slice(1)}
          </option>
        ))}
      </select>
    </div>
  );
}
