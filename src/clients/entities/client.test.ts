import { describe, it, expect } from 'vitest';
import { makeClient } from './client';
import { FixedClock } from '../../shared/time/fixed-clock';
import { newClientId } from '../../shared/ids/client-id';
import { emailAddress } from '../value-objects/email-address';

const CLOCK = new FixedClock(new Date('2025-01-15T12:00:00.000Z'));
const VALID_EMAIL = emailAddress('test@example.com')._unsafeUnwrap();

describe('makeClient', () => {
  it('creates a client with generated id', () => {
    const result = makeClient({ name: 'Acme Corp', email: VALID_EMAIL, clock: CLOCK });
    expect(result.isOk()).toBe(true);
    const client = result._unsafeUnwrap();
    expect(client.name).toBe('Acme Corp');
    expect(client.email).toBe('test@example.com');
    expect(client.createdAt).toEqual(new Date('2025-01-15T12:00:00.000Z'));
    expect(client.id).toBeDefined();
  });

  it('uses provided id when given', () => {
    const id = newClientId();
    const result = makeClient({ name: 'Acme Corp', email: VALID_EMAIL, clock: CLOCK, id });
    expect(result._unsafeUnwrap().id).toBe(id);
  });

  it('trims whitespace from name', () => {
    const result = makeClient({ name: '  Acme Corp  ', email: VALID_EMAIL, clock: CLOCK });
    expect(result._unsafeUnwrap().name).toBe('Acme Corp');
  });

  it('rejects empty name', () => {
    const result = makeClient({ name: '', email: VALID_EMAIL, clock: CLOCK });
    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toEqual({ kind: 'NameTooShort' });
  });

  it('rejects whitespace-only name', () => {
    const result = makeClient({ name: '   ', email: VALID_EMAIL, clock: CLOCK });
    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toEqual({ kind: 'NameTooShort' });
  });

  it('accepts name of exactly 1 character', () => {
    const result = makeClient({ name: 'A', email: VALID_EMAIL, clock: CLOCK });
    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap().name).toBe('A');
  });

  it('accepts name of exactly 200 characters', () => {
    const name = 'A'.repeat(200);
    const result = makeClient({ name, email: VALID_EMAIL, clock: CLOCK });
    expect(result.isOk()).toBe(true);
  });

  it('rejects name of 201 characters', () => {
    const name = 'A'.repeat(201);
    const result = makeClient({ name, email: VALID_EMAIL, clock: CLOCK });
    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toEqual({ kind: 'NameTooLong' });
  });
});
