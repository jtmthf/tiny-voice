import { createFileRoute } from '@tanstack/react-router';
import { useSuspenseQuery } from '@tanstack/react-query';
import { clientsQueryOptions } from '@/app/queries/client-queries';
import { CreateInvoiceForm } from '@/app/invoices/new/create-invoice-form';

export const Route = createFileRoute('/invoices/new')({
  loader: ({ context }) => context.queryClient.ensureQueryData(clientsQueryOptions()),
  component: NewInvoicePage,
});

function NewInvoicePage() {
  const { data: clients } = useSuspenseQuery(clientsQueryOptions());
  const clientOptions = clients.map((c) => ({ id: c.id, name: c.name }));

  return (
    <>
      <h1>New Invoice</h1>
      <div className="card mt-md" style={{ maxWidth: '600px' }}>
        <CreateInvoiceForm clients={clientOptions} />
      </div>
    </>
  );
}
