import { createFileRoute, Link } from '@tanstack/react-router';
import { useSuspenseQuery } from '@tanstack/react-query';
import { clientsQueryOptions } from '@/app/queries/client-queries';
import { formatDate } from '@/app/lib/format-date';

export const Route = createFileRoute('/clients/')({
  loader: ({ context }) => context.queryClient.ensureQueryData(clientsQueryOptions()),
  component: ClientsPage,
});

function ClientsPage() {
  const { data: clients } = useSuspenseQuery(clientsQueryOptions());

  return (
    <>
      <div className="flex-between">
        <h1>Clients</h1>
        <Link to="/clients/new" className="btn btn-primary">New Client</Link>
      </div>
      {clients.length === 0 ? (
        <p role="status" className="empty">No clients yet. <Link to="/clients/new">Add one</Link>.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Created</th>
            </tr>
          </thead>
          <tbody>
            {clients.map((c) => (
              <tr key={c.id}>
                <td><Link to="/clients/$id" params={{ id: c.id }}>{c.name}</Link></td>
                <td>{c.email}</td>
                <td>{formatDate(new Date(c.createdAt))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
