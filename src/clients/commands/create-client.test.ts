import { describe, it, expect } from 'vitest';
import { createClient } from './create-client';
import { InMemoryClientRepo } from '../adapters/in-memory-client-repo';
import { FixedClock } from '../../shared/time/fixed-clock';
import { CapturingLogger } from '../../shared/logger/capturing-logger';
import { expectOk } from '@/shared/testing/expect-ok';
import { expectErr } from '@/shared/testing/expect-err';

const FIXED_DATE = new Date('2025-01-15T12:00:00.000Z');

function makeDeps() {
  return {
    repo: new InMemoryClientRepo(),
    clock: new FixedClock(FIXED_DATE),
    logger: new CapturingLogger(),
  };
}

describe('createClient', () => {
  it('creates and persists a valid client', async () => {
    const deps = makeDeps();
    const result = await createClient(deps, { name: 'Acme Corp', email: 'acme@example.com' });

    const client = expectOk(result);
    expect(client.name).toBe('Acme Corp');
    expect(client.email).toBe('acme@example.com');
    expect(client.createdAt).toEqual(FIXED_DATE);

    // Verify persisted
    const found = deps.repo.findById(client.id);
    expect(found).toEqual(client);
  });

  it('logs on successful creation', async () => {
    const deps = makeDeps();
    await createClient(deps, { name: 'Acme Corp', email: 'acme@example.com' });

    expect(deps.logger.entries).toHaveLength(1);
    expect(deps.logger.entries[0]!.level).toBe('info');
    expect(deps.logger.entries[0]!.message).toBe('Client created');
  });

  it('returns InvalidEmail for bad email', async () => {
    const deps = makeDeps();
    const result = await createClient(deps, { name: 'Acme Corp', email: 'not-an-email' });

    expect(expectErr(result)).toEqual({ kind: 'InvalidEmail', raw: 'not-an-email' });
  });

  it('returns NameTooShort for empty name', async () => {
    const deps = makeDeps();
    const result = await createClient(deps, { name: '', email: 'acme@example.com' });

    expect(expectErr(result)).toEqual({ kind: 'NameTooShort' });
  });

  it('returns NameTooLong for name exceeding 200 characters', async () => {
    const deps = makeDeps();
    const result = await createClient(deps, {
      name: 'A'.repeat(201),
      email: 'acme@example.com',
    });

    expect(expectErr(result)).toEqual({ kind: 'NameTooLong' });
  });

  it('does not persist on validation failure', async () => {
    const deps = makeDeps();
    await createClient(deps, { name: '', email: 'acme@example.com' });

    const all = deps.repo.list();
    expect(all).toHaveLength(0);
  });
});
