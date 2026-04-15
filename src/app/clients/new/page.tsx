import { CreateClientForm } from './create-client-form';

export default function NewClientPage() {
  return (
    <>
      <h1>New Client</h1>
      <div className="card mt-md" style={{ maxWidth: '480px' }}>
        <CreateClientForm />
      </div>
    </>
  );
}
