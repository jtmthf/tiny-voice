import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { isRedirect } from '@tanstack/react-router';
import { buildTestApp } from '@/app/testing/build-test-app';
import { setAppInstanceForTesting } from '@/app/instance';
import { InMemoryFeatureFlags } from '@/shared/flags/in-memory-feature-flags';
import { newClientId } from '@/shared/ids/client-id';
import { newInvoiceId } from '@/shared/ids/invoice-id';
import type { ClientId } from '@/shared/ids/client-id';
import type { AppDeps } from '@/app/app-deps';
import type { CapturingNotificationSender } from '@/invoicing/adapters/capturing-notification-sender';

import { createClientHandler, parseCreateClientInput } from './create-client';
import { createInvoiceHandler, parseCreateInvoiceInput } from './create-invoice';
import { sendInvoiceHandler } from './send-invoice';
import { recordPaymentHandler } from './record-payment';
import { voidInvoiceHandler } from './void-invoice';
import { calculateLateFeeHandler } from './calculate-late-fee';
import { generatePdfHandler } from './generate-pdf';
import { requireFeatureFlag } from './middleware/require-feature-flag';

function redirectIdParam(e: unknown): string | null {
  if (!isRedirect(e)) return null;
  const opts = (e as { options?: { params?: unknown } }).options;
  const params = opts?.params;
  if (
    params &&
    typeof params === 'object' &&
    'id' in params &&
    typeof (params as { id: unknown }).id === 'string'
  ) {
    return (params as { id: string }).id;
  }
  return null;
}

async function createTestClient(): Promise<ClientId> {
  try {
    await createClientHandler({ name: 'Acme Corp', email: 'acme@example.com' });
  } catch (e) {
    const id = redirectIdParam(e);
    if (id) return id as ClientId;
    throw e;
  }
  throw new Error('Expected redirect');
}

async function createTestInvoice(clientId: ClientId, dueDate = '2026-05-01'): Promise<string> {
  try {
    await createInvoiceHandler({
      clientId,
      taxRate: 0,
      dueDate,
      lineItems: [{ description: 'Widget', quantity: 1, unitPriceCents: '10000' }],
    } as unknown as Parameters<typeof createInvoiceHandler>[0]);
  } catch (e) {
    const id = redirectIdParam(e);
    if (id) return id;
    throw e;
  }
  throw new Error('Expected redirect');
}

let app: AppDeps;
let notifications: CapturingNotificationSender;

function setUp(opts?: { lateFeesEnabled?: boolean }) {
  const overrides: Partial<AppDeps> =
    opts?.lateFeesEnabled !== undefined
      ? { featureFlags: new InMemoryFeatureFlags({ lateFees: opts.lateFeesEnabled }) }
      : {};
  const result = buildTestApp(overrides);
  app = result.app;
  notifications = result.capturing.notifications;
  setAppInstanceForTesting(app);
}

afterEach(() => {
  setAppInstanceForTesting(null);
});

describe('createClient handler', () => {
  beforeEach(() => {
    setUp();
  });

  it('redirects to /clients/:id on success', async () => {
    try {
      await createClientHandler({ name: 'Acme', email: 'a@b.com' });
      expect.fail('Expected redirect');
    } catch (e) {
      expect(isRedirect(e)).toBe(true);
      expect((e as { options: { to?: string } }).options.to).toBe('/clients/$id');
    }
  });

  it('throws Error with message for invalid email', async () => {
    await expect(createClientHandler({ name: 'Good', email: 'not-an-email' })).rejects.toThrow(
      /Invalid email/,
    );
  });

  it('rejects empty name at schema boundary', () => {
    expect(() => parseCreateClientInput({ name: '', email: 'a@b.com' })).toThrow();
  });

  it('rejects malformed email at schema boundary', () => {
    expect(() => parseCreateClientInput({ name: 'X', email: 'not-an-email' })).toThrow();
  });

  it('coerces FormData input', () => {
    const fd = new FormData();
    fd.set('name', 'Acme');
    fd.set('email', 'a@b.com');
    expect(parseCreateClientInput(fd)).toEqual({ name: 'Acme', email: 'a@b.com' });
  });
});

describe('createInvoice handler', () => {
  beforeEach(() => {
    setUp();
  });

  it('redirects to /invoices/:id on success', async () => {
    const clientId = await createTestClient();
    try {
      await createInvoiceHandler({
        clientId,
        taxRate: 0,
        dueDate: '2026-05-01',
        lineItems: [{ description: 'Widget', quantity: 1, unitPriceCents: '5000' }],
      } as unknown as Parameters<typeof createInvoiceHandler>[0]);
      expect.fail('Expected redirect');
    } catch (e) {
      expect(isRedirect(e)).toBe(true);
      expect((e as { options: { to?: string } }).options.to).toBe('/invoices/$id');
    }
  });

  it('throws Client not found for nonexistent clientId', async () => {
    await expect(
      createInvoiceHandler({
        clientId: newClientId(),
        taxRate: 0,
        dueDate: '2026-05-01',
        lineItems: [{ description: 'Widget', quantity: 1, unitPriceCents: '5000' }],
      } as unknown as Parameters<typeof createInvoiceHandler>[0]),
    ).rejects.toThrow(/Client not found/);
  });

  it('rejects empty lineItems at schema boundary', () => {
    expect(() =>
      parseCreateInvoiceInput({
        clientId: newClientId(),
        taxRate: '0',
        dueDate: '2026-05-01',
        lineItems: [],
      }),
    ).toThrow(/At least one line item/);
  });

  it('coerces tax rate from percent string and unitPriceCents from string', () => {
    const parsed = parseCreateInvoiceInput({
      clientId: newClientId(),
      taxRate: '10',
      dueDate: '2026-05-01',
      lineItems: [{ description: 'X', quantity: '2', unitPriceCents: '500' }],
    });
    expect(parsed.taxRate).toBeCloseTo(0.1);
    expect(parsed.lineItems[0]?.quantity).toBe(2);
    expect(parsed.lineItems[0]?.unitPriceCents).toBe('500');
  });

  it('parses bracket-notation FormData into nested lineItems', () => {
    const fd = new FormData();
    fd.set('clientId', newClientId());
    fd.set('taxRate', '5');
    fd.set('dueDate', '2026-05-01');
    fd.set('lineItems[0][description]', 'A');
    fd.set('lineItems[0][quantity]', '1');
    fd.set('lineItems[0][unitPriceCents]', '100');
    fd.set('lineItems[1][description]', 'B');
    fd.set('lineItems[1][quantity]', '3');
    fd.set('lineItems[1][unitPriceCents]', '250');
    const parsed = parseCreateInvoiceInput(fd);
    expect(parsed.lineItems).toHaveLength(2);
    expect(parsed.lineItems[1]?.description).toBe('B');
  });
});

describe('sendInvoice handler', () => {
  beforeEach(() => {
    setUp();
  });

  it('returns { error: null } and fires notification on success', async () => {
    const clientId = await createTestClient();
    const invoiceId = await createTestInvoice(clientId);
    const result = await sendInvoiceHandler({
      invoiceId: invoiceId as Parameters<typeof sendInvoiceHandler>[0]['invoiceId'],
    });
    expect(result.error).toBeNull();
    expect(notifications.sent.some((s) => s.type === 'invoiceSent')).toBe(true);
  });

  it('returns InvalidInput error for nonexistent invoice', async () => {
    const result = await sendInvoiceHandler({ invoiceId: newInvoiceId() });
    expect(result.error).toBeTruthy();
  });
});

describe('recordPayment handler', () => {
  beforeEach(() => {
    setUp();
  });

  async function createSentInvoice(): Promise<string> {
    const clientId = await createTestClient();
    const invoiceId = await createTestInvoice(clientId);
    await sendInvoiceHandler({
      invoiceId: invoiceId as Parameters<typeof sendInvoiceHandler>[0]['invoiceId'],
    });
    return invoiceId;
  }

  it('records partial payment, status remains sent', async () => {
    const invoiceId = await createSentInvoice();
    const result = await recordPaymentHandler({
      invoiceId: invoiceId as Parameters<typeof recordPaymentHandler>[0]['invoiceId'],
      amountCents: 5000n,
    });
    expect(result.error).toBeNull();
    const summary = app.queries.invoicing.getInvoiceSummary(
      invoiceId as Parameters<typeof recordPaymentHandler>[0]['invoiceId'],
    );
    expect(summary?.status).toBe('sent');
  });

  it('transitions to paid on full payment and fires notification', async () => {
    const invoiceId = await createSentInvoice();
    const result = await recordPaymentHandler({
      invoiceId: invoiceId as Parameters<typeof recordPaymentHandler>[0]['invoiceId'],
      amountCents: 10000n,
    });
    expect(result.error).toBeNull();
    const summary = app.queries.invoicing.getInvoiceSummary(
      invoiceId as Parameters<typeof recordPaymentHandler>[0]['invoiceId'],
    );
    expect(summary?.status).toBe('paid');
    expect(notifications.sent.some((s) => s.type === 'paymentReceived')).toBe(true);
  });

  it('returns Overpayment error for excess amount', async () => {
    const invoiceId = await createSentInvoice();
    const result = await recordPaymentHandler({
      invoiceId: invoiceId as Parameters<typeof recordPaymentHandler>[0]['invoiceId'],
      amountCents: 999_999n,
    });
    expect(result.error).toMatch(/exceeds/);
  });

  it('returns AlreadyPaid error after full payment', async () => {
    const invoiceId = await createSentInvoice();
    await recordPaymentHandler({
      invoiceId: invoiceId as Parameters<typeof recordPaymentHandler>[0]['invoiceId'],
      amountCents: 10000n,
    });
    const result = await recordPaymentHandler({
      invoiceId: invoiceId as Parameters<typeof recordPaymentHandler>[0]['invoiceId'],
      amountCents: 100n,
    });
    expect(result.error).toMatch(/already fully paid/);
  });
});

describe('voidInvoice handler', () => {
  beforeEach(() => {
    setUp();
  });

  it('voids a draft invoice', async () => {
    const clientId = await createTestClient();
    const invoiceId = await createTestInvoice(clientId);
    const result = await voidInvoiceHandler({
      invoiceId: invoiceId as Parameters<typeof voidInvoiceHandler>[0]['invoiceId'],
    });
    expect(result.error).toBeNull();
    const summary = app.queries.invoicing.getInvoiceSummary(
      invoiceId as Parameters<typeof voidInvoiceHandler>[0]['invoiceId'],
    );
    expect(summary?.status).toBe('void');
  });

  it('returns InvoiceVoided error on double void', async () => {
    const clientId = await createTestClient();
    const invoiceId = await createTestInvoice(clientId);
    await voidInvoiceHandler({
      invoiceId: invoiceId as Parameters<typeof voidInvoiceHandler>[0]['invoiceId'],
    });
    const result = await voidInvoiceHandler({
      invoiceId: invoiceId as Parameters<typeof voidInvoiceHandler>[0]['invoiceId'],
    });
    expect(result.error).toMatch(/voided/);
  });
});

describe('generatePdf handler', () => {
  beforeEach(() => {
    setUp();
  });

  it('returns base64 PDF for an existing invoice', async () => {
    const clientId = await createTestClient();
    const invoiceId = await createTestInvoice(clientId);
    const result = await generatePdfHandler({
      invoiceId: invoiceId as Parameters<typeof generatePdfHandler>[0]['invoiceId'],
    });
    expect(result.contentType).toBe('application/pdf');
    expect(result.filenameSuggestion).toMatch(/^invoice-.+\.pdf$/);
    expect(result.bytesBase64.length).toBeGreaterThan(0);
  });

  it('throws Invoice not found for nonexistent invoice', async () => {
    await expect(generatePdfHandler({ invoiceId: newInvoiceId() })).rejects.toThrow(
      /Invoice not found/,
    );
  });
});

describe('calculateLateFee handler + middleware gate', () => {
  it('middleware throws Feature is disabled when flag is off', async () => {
    setUp({ lateFeesEnabled: false });
    const middleware = requireFeatureFlag('lateFees');
    const serverFn = (
      middleware as unknown as {
        options: { server: (opts: { next: () => Promise<unknown> }) => Promise<unknown> };
      }
    ).options.server;
    // eslint-disable-next-line @typescript-eslint/require-await -- next is typed () => Promise<unknown>
    await expect(serverFn({ next: async () => ({}) })).rejects.toThrow(/Feature is disabled/);
  });

  it('middleware passes through when flag is on', async () => {
    setUp({ lateFeesEnabled: true });
    const middleware = requireFeatureFlag('lateFees');
    const serverFn = (
      middleware as unknown as {
        options: { server: (opts: { next: () => Promise<unknown> }) => Promise<unknown> };
      }
    ).options.server;
    let called = false;
    await serverFn({
      // eslint-disable-next-line @typescript-eslint/require-await -- next is typed () => Promise<unknown>
      next: async () => {
        called = true;
        return {};
      },
    });
    expect(called).toBe(true);
  });

  it('handler returns NotOverdue error when invoice is not overdue', async () => {
    setUp({ lateFeesEnabled: true });
    const clientId = await createTestClient();
    const invoiceId = await createTestInvoice(clientId, '2026-12-01');
    await sendInvoiceHandler({
      invoiceId: invoiceId as Parameters<typeof sendInvoiceHandler>[0]['invoiceId'],
    });
    const result = await calculateLateFeeHandler({
      invoiceId: invoiceId as Parameters<typeof calculateLateFeeHandler>[0]['invoiceId'],
    });
    expect(result.error).toMatch(/not yet overdue/);
  });

  it('handler succeeds for overdue invoice; second call returns LateFeeAlreadyApplied', async () => {
    // FixedClock at 2026-04-13; due date in the past
    setUp({ lateFeesEnabled: true });
    const clientId = await createTestClient();
    const invoiceId = await createTestInvoice(clientId, '2026-01-01');
    await sendInvoiceHandler({
      invoiceId: invoiceId as Parameters<typeof sendInvoiceHandler>[0]['invoiceId'],
    });

    const first = await calculateLateFeeHandler({
      invoiceId: invoiceId as Parameters<typeof calculateLateFeeHandler>[0]['invoiceId'],
    });
    expect(first.error).toBeNull();

    const second = await calculateLateFeeHandler({
      invoiceId: invoiceId as Parameters<typeof calculateLateFeeHandler>[0]['invoiceId'],
    });
    expect(second.error).toMatch(/already been applied/);
  });
});
