import { describe, expect, it } from 'vitest';
import { ok, err, toResult, unwrapOr } from './result';

describe('Result re-exports', () => {
  it('ok wraps a value', () => {
    const r = ok(42);
    expect(r.isOk()).toBe(true);
    expect(r._unsafeUnwrap()).toBe(42);
  });

  it('err wraps an error', () => {
    const r = err('boom');
    expect(r.isErr()).toBe(true);
    expect(r._unsafeUnwrapErr()).toBe('boom');
  });
});

describe('toResult', () => {
  it('captures a successful return', () => {
    const r = toResult(() => 42, String);
    expect(r.isOk()).toBe(true);
    expect(r._unsafeUnwrap()).toBe(42);
  });

  it('captures a thrown error', () => {
    const r = toResult(
      () => { throw new Error('fail'); },
      (e) => (e as Error).message,
    );
    expect(r.isErr()).toBe(true);
    expect(r._unsafeUnwrapErr()).toBe('fail');
  });
});

describe('unwrapOr', () => {
  it('returns the value on ok', () => {
    expect(unwrapOr(ok(10), 0)).toBe(10);
  });

  it('returns the fallback on err', () => {
    expect(unwrapOr(err('nope'), 0)).toBe(0);
  });
});
