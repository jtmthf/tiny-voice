import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { setupDb } from '../../shared/testing/db-fixture';
import { SqliteClientRepo } from './sqlite-client-repo';
import { testClient } from '../testing/client-factory';
import { newClientId } from '../../shared/ids/client-id';
import { emailAddress } from '../value-objects/email-address';
import { expectOk } from '@/shared/testing/expect-ok';
import type { Database } from '../../shared/db/database';

let db: Database;
let teardown: () => void;
let repo: SqliteClientRepo;

beforeEach(() => {
  const fixture = setupDb();
  db = fixture.db;
  teardown = fixture.teardown;
  repo = new SqliteClientRepo(db);
});

afterEach(() => {
  teardown();
});

describe('SqliteClientRepo', () => {
  it('save then findById round-trip', async () => {
    const client = testClient();
    repo.save(client);

    const found = repo.findById(client.id);
    expect(found).not.toBeNull();
    expect(found!.id).toBe(client.id);
    expect(found!.name).toBe(client.name);
    expect(found!.email).toBe(client.email);
    expect(found!.createdAt.toISOString()).toBe(client.createdAt.toISOString());
  });

  it('findById returns null for non-existent id', async () => {
    const found = repo.findById(newClientId());
    expect(found).toBeNull();
  });

  it('save then update (upsert)', async () => {
    const client = testClient();
    repo.save(client);

    const updated = {
      ...client,
      name: 'Updated Name',
      email: expectOk(emailAddress('updated@example.com')),
    };
    repo.save(updated);

    const found = repo.findById(client.id);
    expect(found!.name).toBe('Updated Name');
    expect(found!.email).toBe('updated@example.com');
  });

  it('list returns clients ordered by createdAt ascending', async () => {
    const first = testClient({
      id: newClientId(),
      name: 'First',
      createdAt: new Date('2025-01-01T00:00:00.000Z'),
    });
    const second = testClient({
      id: newClientId(),
      name: 'Second',
      createdAt: new Date('2025-02-01T00:00:00.000Z'),
    });
    const third = testClient({
      id: newClientId(),
      name: 'Third',
      createdAt: new Date('2025-03-01T00:00:00.000Z'),
    });

    // Save out of order
    repo.save(third);
    repo.save(first);
    repo.save(second);

    const all = repo.list();
    expect(all).toHaveLength(3);
    expect(all[0]!.name).toBe('First');
    expect(all[1]!.name).toBe('Second');
    expect(all[2]!.name).toBe('Third');
  });

  it('list returns empty array when no clients exist', async () => {
    const all = repo.list();
    expect(all).toEqual([]);
  });
});
