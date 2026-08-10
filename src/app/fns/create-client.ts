import { createServerFn } from '@tanstack/react-start';
import { redirect } from '@tanstack/react-router';
import { z } from 'zod';
import { getAppInstance } from '@/app/instance';
import { createClient } from '@/clients/commands/create-client';
import { clientErrorMessage } from '@/app/lib/error-messages';

export const CreateClientInput = z.object({
  name: z.string().min(1),
  email: z.email(),
});

export type CreateClientInput = z.infer<typeof CreateClientInput>;

export function parseCreateClientInput(data: unknown): CreateClientInput {
  const raw = data instanceof FormData ? Object.fromEntries(data.entries()) : data;
  return CreateClientInput.parse(raw);
}

export function createClientHandler(data: CreateClientInput): Promise<never> {
  const app = getAppInstance();
  const result = createClient(
    { repo: app.clientRepo, clock: app.clock, logger: app.logger },
    { name: data.name, email: data.email },
  );
  if (result.isErr()) return Promise.reject(new Error(clientErrorMessage(result.error)));
  // redirect() is TanStack Router's documented control-flow signal, not an Error.
  // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
  return Promise.reject(redirect({ to: '/clients/$id', params: { id: result.value.id } }));
}

export const createClientFn = createServerFn({ method: 'POST' })
  .validator(parseCreateClientInput)
  .handler(({ data }) => createClientHandler(data));
