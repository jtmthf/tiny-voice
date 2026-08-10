import { describe, expect, it } from 'vitest';
import { newInvoiceId, parseInvoiceId, InvoiceIdSchema } from './invoice-id';
import { newClientId, parseClientId, ClientIdSchema } from './client-id';
import { newLineItemId, parseLineItemId, LineItemIdSchema } from './line-item-id';
import { newPaymentId, parsePaymentId, PaymentIdSchema } from './payment-id';
import { expectOk } from '@/shared/testing/expect-ok';

const BARE_UUID = '01961f3d-7b1a-7000-8000-000000000001';

describe('InvoiceId', () => {
  it('mints prefixed UUIDs', () => {
    expect(newInvoiceId()).toMatch(/^inv_/);
  });

  it('parseInvoiceId validates prefix', () => {
    const id = newInvoiceId();
    expect(expectOk(parseInvoiceId(id))).toBe(id);
  });

  it('parseInvoiceId returns Err for a wrong prefix', () => {
    expect(parseInvoiceId(newClientId()).isErr()).toBe(true);
  });

  it('schema validates a prefixed ID', () => {
    expect(InvoiceIdSchema.safeParse(newInvoiceId()).success).toBe(true);
  });

  it('schema rejects bare UUID', () => {
    expect(InvoiceIdSchema.safeParse(BARE_UUID).success).toBe(false);
  });

  it('schema rejects non-UUID', () => {
    expect(InvoiceIdSchema.safeParse('not-a-uuid').success).toBe(false);
  });
});

describe('ClientId', () => {
  it('mints and validates', () => {
    const id = newClientId();
    expect(id).toMatch(/^client_/);
    expect(ClientIdSchema.safeParse(id).success).toBe(true);
  });

  it('parseClientId returns Err for a wrong prefix', () => {
    expect(parseClientId(newInvoiceId()).isErr()).toBe(true);
  });

  it('rejects bare UUID', () => {
    expect(ClientIdSchema.safeParse(BARE_UUID).success).toBe(false);
  });
});

describe('LineItemId', () => {
  it('mints and validates', () => {
    const id = newLineItemId();
    expect(id).toMatch(/^li_/);
    expect(LineItemIdSchema.safeParse(id).success).toBe(true);
    expect(expectOk(parseLineItemId(id))).toBe(id);
  });
});

describe('PaymentId', () => {
  it('mints and validates', () => {
    const id = newPaymentId();
    expect(id).toMatch(/^pay_/);
    expect(PaymentIdSchema.safeParse(id).success).toBe(true);
    expect(expectOk(parsePaymentId(id))).toBe(id);
  });
});

describe('ID prefixes', () => {
  it('are distinct across the four families', () => {
    const prefixes = [newInvoiceId(), newClientId(), newLineItemId(), newPaymentId()].map(
      (id) => id.split('_')[0],
    );
    expect(new Set(prefixes).size).toBe(4);
  });
});
