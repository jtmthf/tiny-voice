import { z } from 'zod';
import type { Result } from 'neverthrow';
import { defineValueObject } from '@/shared/domain/value-object';

/**
 * Branded string type for validated email addresses.
 */
export const EmailAddress = defineValueObject('EmailAddress', z.email());

export type EmailAddress = z.infer<typeof EmailAddress.schema>;

export const EmailAddressSchema = EmailAddress.schema;

export interface EmailError {
  readonly kind: 'InvalidEmail';
  readonly raw: string;
}

/**
 * Parses a raw string into a validated EmailAddress.
 *
 * Narrows the kit's `ValueObjectError` to `EmailError` because
 * `CreateClientError` and the app's error-message switch discriminate on
 * `kind: 'InvalidEmail'`.
 */
export function emailAddress(raw: string): Result<EmailAddress, EmailError> {
  return EmailAddress.parse(raw).mapErr(() => ({ kind: 'InvalidEmail', raw }) as const);
}
