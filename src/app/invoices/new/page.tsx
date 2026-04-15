import { cacheTag } from 'next/cache';
import { app } from '@/app/app';
import { CreateInvoiceForm } from './create-invoice-form';

async function ClientOptions() {
  'use cache';
  cacheTag('clients');

  const clients = await app.queries.clients.listClients();
  return clients.map((c) => ({ id: c.id, name: c.name }));
}

export default async function NewInvoicePage() {
  const clients = await ClientOptions();

  return (
    <>
      <h1>New Invoice</h1>
      <div className="card mt-md" style={{ maxWidth: '600px' }}>
        <CreateInvoiceForm clients={clients} />
      </div>
    </>
  );
}
