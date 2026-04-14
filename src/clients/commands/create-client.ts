import { z } from 'zod/v4';
import type { Result } from 'neverthrow';
import type { ClientRepository } from '../ports/client-repository';
import type { Clock } from '../../shared/time/clock';
import type { Logger } from '../../shared/logger/logger';
import type { Client, ClientValidationError } from '../entities/client';
import { makeClient } from '../entities/client';
import { emailAddress } from '../value-objects/email-address';
import type { EmailError } from '../value-objects/email-address';

/**
 * Input schema for the createClient command.
 * Email is a raw string here — parsed to EmailAddress inside the handler.
 */
export const CreateClientInput = z.object({
  name: z.string(),
  email: z.string(),
});

export type CreateClientInput = z.infer<typeof CreateClientInput>;

export type CreateClientError = ClientValidationError | EmailError;

/**
 * Command handler: validates input, creates a Client, and persists it.
 */
export function createClient(
  deps: { repo: ClientRepository; clock: Clock; logger: Logger },
  input: CreateClientInput,
): Result<Client, CreateClientError> {
  const emailResult = emailAddress(input.email);
  if (emailResult.isErr()) {
    return emailResult.map(() => undefined as never);
  }

  const clientResult = makeClient({
    name: input.name,
    email: emailResult.value,
    clock: deps.clock,
  });

  if (clientResult.isErr()) {
    return clientResult;
  }

  const client = clientResult.value;
  deps.repo.save(client);
  deps.logger.info('Client created', { clientId: client.id, name: client.name });

  return clientResult;
}
