import Link from 'next/link';
import { cacheTag } from 'next/cache';
import { app } from '@/app/instance';
import { formatDate } from '@/app/lib/format-date';

async function ClientList() {
  'use cache';
  cacheTag('clients');

  const clients = await app.queries.clients.listClients();

  if (clients.length === 0) {
    return <p className="empty">No clients yet. <Link href="/clients/new">Add one</Link>.</p>;
  }

  return (
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
            <td><Link href={`/clients/${c.id}`}>{c.name}</Link></td>
            <td>{String(c.email)}</td>
            <td>{formatDate(c.createdAt)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function ClientsPage() {
  return (
    <>
      <div className="flex-between">
        <h1>Clients</h1>
        <Link href="/clients/new" className="btn btn-primary">New Client</Link>
      </div>
      <ClientList />
    </>
  );
}
