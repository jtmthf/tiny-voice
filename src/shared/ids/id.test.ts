import { describe, expect, it } from 'vitest';
import { newId, parseId, toDb, fromDb } from './id';
import { newInvoiceId, parseInvoiceId, InvoiceIdSchema } from './invoice-id';
import { newClientId, parseClientId, ClientIdSchema } from './client-id';
import { newLineItemId, LineItemIdSchema } from './line-item-id';
import { newPaymentId, PaymentIdSchema } from './payment-id';

describe('Id factory', () => {
  it('generates prefixed unique UUIDs', () => {
    const make = newId('test');
    const a = make();
    const b = make();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^test_[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});

describe('parseId', () => {
  it('accepts a correctly prefixed ID', () => {
    const id = newId('foo')();
    expect(() => parseId('foo', id)).not.toThrow();
    expect(parseId('foo', id)).toBe(id);
  });

  it('rejects wrong prefix', () => {
    const id = newId('foo')();
    expect(() => parseId('bar', id)).toThrow('Expected bar_ prefix');
  });

  it('rejects invalid UUID portion', () => {
    expect(() => parseId('foo', 'foo_not-a-uuid')).toThrow('Invalid UUID');
  });
});

describe('toDb / fromDb', () => {
  it('strips prefix for DB storage', () => {
    const id = newId('client')();
    const raw = toDb(id);
    expect(raw).not.toContain('client_');
    expect(raw).toMatch(/^[0-9a-f]{8}-/);
  });

  it('reconstitutes prefixed ID from raw UUID', () => {
    const id = newId('client')();
    const raw = toDb(id);
    const restored = fromDb('client', raw);
    expect(restored).toBe(id);
  });
});

describe('InvoiceId', () => {
  it('mints prefixed UUIDs', () => {
    const id = newInvoiceId();
    expect(id).toMatch(/^inv_/);
  });

  it('parseInvoiceId validates prefix', () => {
    const id = newInvoiceId();
    expect(parseInvoiceId(id)).toBe(id);
  });

  it('parseInvoiceId rejects wrong prefix', () => {
    const id = newClientId();
    expect(() => parseInvoiceId(id)).toThrow();
  });

  it('schema validates a prefixed ID', () => {
    const id = newInvoiceId();
    const result = InvoiceIdSchema.safeParse(id);
    expect(result.success).toBe(true);
  });

  it('schema rejects bare UUID', () => {
    const result = InvoiceIdSchema.safeParse('01961f3d-7b1a-7000-8000-000000000001');
    expect(result.success).toBe(false);
  });

  it('schema rejects non-UUID', () => {
    const result = InvoiceIdSchema.safeParse('not-a-uuid');
    expect(result.success).toBe(false);
  });
});

describe('ClientId', () => {
  it('mints and validates', () => {
    const id = newClientId();
    expect(id).toMatch(/^client_/);
    expect(ClientIdSchema.safeParse(id).success).toBe(true);
  });

  it('parseClientId rejects wrong prefix', () => {
    const id = newInvoiceId();
    expect(() => parseClientId(id)).toThrow();
  });

  it('rejects bare UUID', () => {
    expect(ClientIdSchema.safeParse('01961f3d-7b1a-7000-8000-000000000001').success).toBe(false);
  });
});

describe('LineItemId', () => {
  it('mints and validates', () => {
    const id = newLineItemId();
    expect(id).toMatch(/^li_/);
    expect(LineItemIdSchema.safeParse(id).success).toBe(true);
  });
});

describe('PaymentId', () => {
  it('mints and validates', () => {
    const id = newPaymentId();
    expect(id).toMatch(/^pay_/);
    expect(PaymentIdSchema.safeParse(id).success).toBe(true);
  });
});
