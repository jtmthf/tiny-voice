import { describe, it, expect } from 'vitest';
import { InMemoryClientRepo } from './in-memory-client-repo';
import { testClient } from '../testing/client-factory';
import { newClientId } from '../../shared/ids/client-id';

describe('InMemoryClientRepo', () => {
  it('save then findById round-trip', async () => {
    const repo = new InMemoryClientRepo();
    const client = testClient();
    repo.save(client);

    const found = repo.findById(client.id);
    expect(found).toEqual(client);
  });

  it('findById returns null for non-existent id', async () => {
    const repo = new InMemoryClientRepo();
    const found = repo.findById(newClientId());
    expect(found).toBeNull();
  });

  it('can be seeded with initial data', async () => {
    const client = testClient();
    const repo = new InMemoryClientRepo([client]);

    const found = repo.findById(client.id);
    expect(found).toEqual(client);
  });

  it('save overwrites existing client', async () => {
    const repo = new InMemoryClientRepo();
    const client = testClient();
    repo.save(client);

    const updated = { ...client, name: 'Updated' };
    repo.save(updated);

    const found = repo.findById(client.id);
    expect(found!.name).toBe('Updated');
  });

  it('list returns clients sorted by createdAt', async () => {
    const repo = new InMemoryClientRepo();
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

    repo.save(second);
    repo.save(first);

    const all = repo.list();
    expect(all[0]!.name).toBe('First');
    expect(all[1]!.name).toBe('Second');
  });
});
