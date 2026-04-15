'use client';

import { useRouter } from 'next/navigation';
import { useServerAction } from '@orpc/react/hooks';
import { onSuccessDeferred } from '@orpc/react';
import { actions } from '@/app/rpc/actions';
import { FormField } from '@/app/lib/form/form-field';
import { FormError } from '@/app/lib/form/form-error';

export function CreateClientForm() {
  const router = useRouter();

  const create = useServerAction(actions.clients.create, {
    interceptors: [
      onSuccessDeferred((output) => {
        router.push(`/clients/${output.id}`);
      }),
    ],
  });

  return (
    <form onSubmit={(e) => {
      e.preventDefault();
      const form = new FormData(e.currentTarget);
      void create.execute({
        name: form.get('name') as string,
        email: form.get('email') as string,
      });
    }}>
      <FormField label="Name" name="name" required minLength={1} />
      <FormField label="Email" name="email" type="email" required />
      <FormError error={create.error?.message ?? null} />
      <div className="actions-row">
        <button type="submit" className="btn-primary" disabled={create.isPending}>
          {create.isPending ? 'Creating...' : 'Create Client'}
        </button>
      </div>
    </form>
  );
}
