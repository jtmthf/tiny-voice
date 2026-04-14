import { z } from 'zod/v4';
import { ok, err } from 'neverthrow';
import type { Result } from 'neverthrow';

/**
 * Branded string type for validated email addresses.
 */
export type EmailAddress = string & { readonly __brand: 'EmailAddress' };

export const EmailAddressSchema = z.email().transform((val) => val as EmailAddress);

export interface EmailError {
  readonly kind: 'InvalidEmail';
  readonly raw: string;
}

/**
 * Parses a raw string into a validated EmailAddress.
 */
export function emailAddress(raw: string): Result<EmailAddress, EmailError> {
  const result = EmailAddressSchema.safeParse(raw);
  if (result.success) {
    return ok(result.data);
  }
  return err({ kind: 'InvalidEmail', raw });
}
