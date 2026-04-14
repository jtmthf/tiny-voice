import { describe, it, expect } from 'vitest';
import { emailAddress } from './email-address';

describe('emailAddress', () => {
  it('accepts a valid email', () => {
    const result = emailAddress('user@example.com');
    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toBe('user@example.com');
  });

  it('accepts email with subdomain', () => {
    const result = emailAddress('user@mail.example.com');
    expect(result.isOk()).toBe(true);
  });

  it('rejects empty string', () => {
    const result = emailAddress('');
    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toEqual({ kind: 'InvalidEmail', raw: '' });
  });

  it('rejects string without @', () => {
    const result = emailAddress('not-an-email');
    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toEqual({ kind: 'InvalidEmail', raw: 'not-an-email' });
  });

  it('rejects string with spaces', () => {
    const result = emailAddress('user @example.com');
    expect(result.isErr()).toBe(true);
  });

  it('rejects missing domain', () => {
    const result = emailAddress('user@');
    expect(result.isErr()).toBe(true);
  });
});
