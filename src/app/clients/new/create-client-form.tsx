'use client';

import { useActionState } from 'react';
import { createClientForm, type FormState } from '@/app/lib/actions/index';
import { FormField, FormError, SubmitButton } from '@/app/lib/form/index';

const initialState: FormState = { error: null };

export function CreateClientForm() {
  const [state, formAction] = useActionState(createClientForm, initialState);

  return (
    <form action={formAction}>
      <FormField label="Name" name="name" required minLength={1} />
      <FormField label="Email" name="email" type="email" required />
      <FormError error={state.error} />
      <SubmitButton pendingText="Creating...">Create Client</SubmitButton>
    </form>
  );
}
