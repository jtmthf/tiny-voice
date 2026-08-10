import { parseClientId } from '@/shared/ids/client-id';
import { expectOk } from '@/shared/testing/expect-ok';
import type { Client } from '../entities/client';
import { EmailAddress } from '../value-objects/email-address';

const FIXED_ID = expectOk(parseClientId('client_00000000-0000-7000-8000-000000000001'));
// A literal, known-valid address — parsing it in a factory would only add noise.
const FIXED_EMAIL = EmailAddress.trusted('test@example.com');
const FIXED_DATE = new Date('2025-01-15T12:00:00.000Z');

/**
 * Test factory for Client. Returns sensible defaults; any field can be overridden.
 */
export function testClient(overrides?: Partial<Client>): Client {
  return {
    id: FIXED_ID,
    name: 'Test Client',
    email: FIXED_EMAIL,
    createdAt: FIXED_DATE,
    ...overrides,
  };
}
