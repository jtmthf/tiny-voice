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
  /** The kit's validation messages, forwarded verbatim. */
  readonly issues: readonly string[];
}

/**
 * Parses a raw string into a validated EmailAddress.
 *
 * Narrows the kit's `ValueObjectError` to `EmailError` rather than surfacing it
 * directly: `CreateClientError` is a union discriminated on `kind`, and
 * `kind: 'InvalidValueObject'` would stop discriminating as soon as a second
 * value object joins that union. The validation detail is carried across in
 * `issues` instead of being discarded.
 */
export function emailAddress(raw: string): Result<EmailAddress, EmailError> {
  return EmailAddress.parse(raw).mapErr(
    (error): EmailError => ({ kind: 'InvalidEmail', raw, issues: error.issues }),
  );
}
