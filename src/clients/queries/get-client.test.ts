import { describe, it, expect } from 'vitest';
import { getClient } from './get-client';
import { InMemoryClientRepo } from '../adapters/in-memory-client-repo';
import { testClient } from '../testing/client-factory';
import { newClientId } from '@/shared/ids/client-id';

describe('getClient', () => {
  it('returns client when found', () => {
    const client = testClient();
    const repo = new InMemoryClientRepo([client]);

    const found = getClient({ repo }, client.id);
    expect(found).toEqual(client);
  });

  it('returns null when not found', () => {
    const repo = new InMemoryClientRepo();
    const found = getClient({ repo }, newClientId());
    expect(found).toBeNull();
  });
});
