import { ok, err } from 'neverthrow';
import type { Result } from 'neverthrow';
import type { ClientId } from '../../shared/ids/client-id';
import { newClientId } from '../../shared/ids/client-id';
import type { EmailAddress } from '../value-objects/email-address';
import type { Clock } from '../../shared/time/clock';

/**
 * Client entity — immutable data type.
 */
export interface Client {
  readonly id: ClientId;
  readonly name: string;
  readonly email: EmailAddress;
  readonly createdAt: Date;
}

export type ClientValidationError =
  | { readonly kind: 'NameTooShort' }
  | { readonly kind: 'NameTooLong' };

/**
 * Pure factory for creating a Client. Validates name (1-200 chars, trimmed),
 * generates id if not provided, sets createdAt from clock.
 */
export function makeClient(input: {
  name: string;
  email: EmailAddress;
  clock: Clock;
  id?: ClientId | undefined;
}): Result<Client, ClientValidationError> {
  const trimmed = input.name.trim();

  if (trimmed.length === 0) {
    return err({ kind: 'NameTooShort' });
  }
  if (trimmed.length > 200) {
    return err({ kind: 'NameTooLong' });
  }

  return ok({
    id: input.id ?? newClientId(),
    name: trimmed,
    email: input.email,
    createdAt: input.clock.now(),
  });
}
