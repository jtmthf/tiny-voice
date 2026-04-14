import { describe, it, expect } from 'vitest';
import { listClients } from './list-clients';
import { InMemoryClientRepo } from '../adapters/in-memory-client-repo';
import { testClient } from '../testing/client-factory';
import { newClientId } from '../../shared/ids/client-id';

describe('listClients', () => {
  it('returns empty array when no clients', async () => {
    const repo = new InMemoryClientRepo();
    const result = await listClients({ repo });
    expect(result).toEqual([]);
  });

  it('returns all clients sorted by createdAt', async () => {
    const first = testClient({
      id: newClientId(),
      name: 'First',
      createdAt: new Date('2025-01-01'),
    });
    const second = testClient({
      id: newClientId(),
      name: 'Second',
      createdAt: new Date('2025-06-01'),
    });
    const repo = new InMemoryClientRepo([second, first]);

    const result = await listClients({ repo });
    expect(result).toHaveLength(2);
    expect(result[0]!.name).toBe('First');
    expect(result[1]!.name).toBe('Second');
  });
});
