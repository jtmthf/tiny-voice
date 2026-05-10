import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createClientFn } from '@/app/fns/create-client';
import { FormField } from '@/app/lib/form/form-field';
import { FormError } from '@/app/lib/form/form-error';

export function CreateClientForm() {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: (data: { name: string; email: string }) => createClientFn({ data }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['clients'] }),
  });

  return (
    <form
      action={createClientFn.url}
      method="POST"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        mutation.mutate({ name: fd.get('name') as string, email: fd.get('email') as string });
      }}
    >
      <FormField label="Name" name="name" required minLength={1} />
      <FormField label="Email" name="email" type="email" required />
      <FormError error={mutation.error instanceof Error ? mutation.error.message : null} />
      <div className="actions-row">
        <button type="submit" className="btn-primary" disabled={mutation.isPending}>
          {mutation.isPending ? 'Creating...' : 'Create Client'}
        </button>
      </div>
    </form>
  );
}
