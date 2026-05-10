import { createFileRoute } from '@tanstack/react-router';
import { CreateClientForm } from '@/app/clients/new/create-client-form';

export const Route = createFileRoute('/clients/new')({
  component: NewClientPage,
});

function NewClientPage() {
  return (
    <>
      <h1>New Client</h1>
      <div className="card mt-md" style={{ maxWidth: '480px' }}>
        <CreateClientForm />
      </div>
    </>
  );
}
