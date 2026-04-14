import { describe, it, expect } from 'vitest';
import { getClient } from './get-client';
import { InMemoryClientRepo } from '../adapters/in-memory-client-repo';
import { testClient } from '../testing/client-factory';
import { newClientId } from '../../shared/ids/client-id';

describe('getClient', () => {
  it('returns client when found', async () => {
    const client = testClient();
    const repo = new InMemoryClientRepo([client]);

    const found = await getClient({ repo }, client.id);
    expect(found).toEqual(client);
  });

  it('returns null when not found', async () => {
    const repo = new InMemoryClientRepo();
    const found = await getClient({ repo }, newClientId());
    expect(found).toBeNull();
  });
});
