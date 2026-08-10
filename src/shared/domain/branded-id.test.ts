import { describe, expect, it } from 'vitest';
import { defineBrandedId, toDb, fromDb, type Id } from './branded-id';
import { expectOk } from '@/shared/testing/expect-ok';
import { expectErr } from '@/shared/testing/expect-err';

const Foo = defineBrandedId('foo');
const Bar = defineBrandedId('bar');

const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('defineBrandedId', () => {
  it('exposes the prefix it was defined with', () => {
    expect(Foo.prefix).toBe('foo');
  });

  it('create generates prefixed unique UUIDs', () => {
    const a = Foo.create();
    const b = Foo.create();
    expect(a).not.toBe(b);
    expect(a).toMatch(new RegExp(`^foo_${UUID_V7.source.slice(1)}`));
  });
});

describe('BrandedId.parse', () => {
  it('accepts a correctly prefixed ID', () => {
    const id = Foo.create();
    expect(expectOk(Foo.parse(id))).toBe(id);
  });

  it('returns Err for a wrong prefix', () => {
    const id = Foo.create();
    const error = expectErr(Bar.parse(id));
    expect(error.kind).toBe('InvalidValueObject');
    expect(error.brand).toBe('bar');
    expect(error.raw).toBe(id);
    expect(error.issues).toEqual(['Expected a valid bar_ prefixed ID']);
  });

  it('returns Err for a malformed UUID portion', () => {
    expect(Foo.parse('foo_not-a-uuid').isErr()).toBe(true);
  });

  it('returns Err for a bare UUID with no prefix', () => {
    expect(Foo.parse('01961f3d-7b1a-7000-8000-000000000001').isErr()).toBe(true);
  });

  it('returns Err for a non-string', () => {
    expect(Foo.parse(42).isErr()).toBe(true);
    expect(Foo.parse(null).isErr()).toBe(true);
  });
});

describe('BrandedId.is', () => {
  it('narrows a valid ID', () => {
    const raw: unknown = Foo.create();
    expect(Foo.is(raw)).toBe(true);
    if (Foo.is(raw)) {
      const id: Id<'foo'> = raw;
      expect(id).toBe(raw);
    }
  });

  it('rejects a wrong-prefix ID', () => {
    expect(Bar.is(Foo.create())).toBe(false);
  });
});

describe('BrandedId.schema', () => {
  it('accepts a prefixed ID', () => {
    expect(Foo.schema.safeParse(Foo.create()).success).toBe(true);
  });

  it('rejects a bare UUID', () => {
    expect(Foo.schema.safeParse('01961f3d-7b1a-7000-8000-000000000001').success).toBe(false);
  });

  it('rejects a non-UUID', () => {
    expect(Foo.schema.safeParse('not-a-uuid').success).toBe(false);
  });
});

describe('toDb / fromDb', () => {
  it('strips the prefix for DB storage', () => {
    const id = Foo.create();
    const raw = toDb(id);
    expect(raw).not.toContain('foo_');
    expect(raw).toMatch(UUID_V7);
  });

  it('returns the input unchanged when there is no prefix separator', () => {
    // Not reachable through the kit's constructors — pins the documented
    // behavior of the raw helper.
    const unprefixed = 'no-separator-here' as Id<'foo'>;
    expect(toDb(unprefixed)).toBe('no-separator-here');
  });

  it('round-trips create() through toDb and fromDb', () => {
    const id = Foo.create();
    expect(fromDb('foo', toDb(id))).toBe(id);
  });

  it('round-trips through the kit methods', () => {
    const id = Foo.create();
    expect(Foo.fromDb(Foo.toDb(id))).toBe(id);
  });

  it('produces IDs that parse cleanly after a DB round-trip', () => {
    const id = Foo.create();
    expect(expectOk(Foo.parse(Foo.fromDb(Foo.toDb(id))))).toBe(id);
  });
});

describe('branded ID types', () => {
  it('are not mutually assignable across prefixes', () => {
    const fooId = Foo.create();
    const barId = Bar.create();

    // @ts-expect-error a bar-prefixed ID is not a foo-prefixed ID.
    const notAFoo: Id<'foo'> = barId;
    // @ts-expect-error a bare string is not a branded ID — it must be parsed.
    const alsoNotAFoo: Id<'foo'> = 'foo_01961f3d-7b1a-7000-8000-000000000001';

    expect(notAFoo).not.toBe(fooId);
    expect(alsoNotAFoo).not.toBe(fooId);
  });
});
