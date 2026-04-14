import { describe, it, expect, beforeEach } from 'vitest';
import { call } from '@orpc/server';
import { ORPCError } from '@orpc/client';

type AnyORPCError = ORPCError<string, unknown>;
import { FixedClock } from '@/shared/time/fixed-clock';
import { InProcessEventBus } from '@/shared/events/in-process-event-bus';
import { InMemoryOutbox } from '@/shared/events/in-memory-outbox';
import { InMemoryClientRepo } from '@/clients/adapters/in-memory-client-repo';
import { InMemoryInvoiceRepo } from '@/invoicing/adapters/in-memory-invoice-repo';
import { StubPdfGenerator } from '@/invoicing/adapters/stub-pdf-generator';
import { CapturingNotificationSender } from '@/invoicing/adapters/capturing-notification-sender';
import type { InvoicingEventMap } from '@/invoicing/events/invoicing-event-map';
import { InMemoryFeatureFlags } from '@/shared/flags/in-memory-feature-flags';
import type { Database } from '@/shared/db/database';
import type { RpcContext } from './rpc-context';
import { router } from './router';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

const STUB_DB: Database = {
  prepare() { throw new Error('Stub DB'); },
  exec() { throw new Error('Stub DB'); },
  transaction<T>(fn: () => T): T { return fn(); },
  close() { /* noop */ },
};

function buildTestContext(overrides?: { lateFeesEnabled?: boolean }): RpcContext {
  return {
    db: STUB_DB,
    clientRepo: new InMemoryClientRepo(),
    invoiceRepo: new InMemoryInvoiceRepo(),
    pdfGenerator: new StubPdfGenerator(),
    notifications: new CapturingNotificationSender(),
    outbox: new InMemoryOutbox(),
    eventBus: new InProcessEventBus<InvoicingEventMap>(),
    clock: new FixedClock(new Date('2025-03-01T12:00:00Z')),
    logger: {
      info: () => { /* noop */ },
      warn: () => { /* noop */ },
      error: () => { /* noop */ },
      debug: () => { /* noop */ },
    },
    featureFlags: new InMemoryFeatureFlags({
      lateFees: overrides?.lateFeesEnabled ?? false,
    }),
  };
}

function callWithContext<T>(
  procedure: { '~orpc': unknown },
  input: unknown,
  context: RpcContext,
): Promise<T> {
  return call(procedure as Parameters<typeof call>[0], input, { context }) as Promise<T>;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('RPC router', () => {
  let ctx: RpcContext;

  beforeEach(() => {
    ctx = buildTestContext();
  });

  // -------------------------------------------------------------------------
  // Clients
  // -------------------------------------------------------------------------

  describe('clients.create', () => {
    it('creates a client and returns a DTO', async () => {
      const result = await callWithContext<{ id: string; name: string; email: string }>(
        router.clients.create,
        { name: 'Acme Corp', email: 'acme@example.com' },
        ctx,
      );

      expect(result.name).toBe('Acme Corp');
      expect(result.email).toBe('acme@example.com');
      expect(result.id).toBeDefined();
      expect(result).toHaveProperty('createdAt');
    });

    it('rejects empty name at Zod boundary', async () => {
      try {
        await callWithContext(router.clients.create, { name: '', email: 'a@b.com' }, ctx);
        expect.fail('Should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(ORPCError);
        expect((e as AnyORPCError).code).toBe('BAD_REQUEST');
      }
    });

    it('returns NAME_TOO_LONG for oversized name', async () => {
      try {
        await callWithContext(
          router.clients.create,
          { name: 'A'.repeat(201), email: 'a@b.com' },
          ctx,
        );
        expect.fail('Should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(ORPCError);
        expect((e as AnyORPCError).code).toBe('NAME_TOO_LONG');
      }
    });

    it('rejects invalid email at Zod boundary', async () => {
      try {
        await callWithContext(router.clients.create, { name: 'Good Name', email: 'not-an-email' }, ctx);
        expect.fail('Should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(ORPCError);
        expect((e as AnyORPCError).code).toBe('BAD_REQUEST');
      }
    });
  });

  // -------------------------------------------------------------------------
  // Invoicing — create
  // -------------------------------------------------------------------------

  describe('invoicing.create', () => {
    it('creates a draft invoice when client exists', async () => {
      // First create a client
      const client = await callWithContext<{ id: string }>(
        router.clients.create,
        { name: 'Test Client', email: 'test@example.com' },
        ctx,
      );

      const invoice = await callWithContext<{ id: string; status: string; clientId: string }>(
        router.invoicing.create,
        { clientId: client.id, taxRate: 0.1, dueDate: '2025-04-01' },
        ctx,
      );

      expect(invoice.status).toBe('draft');
      expect(invoice.clientId).toBe(client.id);
    });

    it('returns CLIENT_NOT_FOUND for nonexistent clientId', async () => {
      try {
        await callWithContext(
          router.invoicing.create,
          { clientId: 'client_00000000-0000-0000-0000-000000000000', taxRate: 0.1, dueDate: '2025-04-01' },
          ctx,
        );
        expect.fail('Should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(ORPCError);
        expect((e as AnyORPCError).code).toBe('CLIENT_NOT_FOUND');
      }
    });
  });

  // -------------------------------------------------------------------------
  // Invoicing — addLineItem
  // -------------------------------------------------------------------------

  describe('invoicing.addLineItem', () => {
    it('adds a line item to a draft invoice', async () => {
      const client = await callWithContext<{ id: string }>(
        router.clients.create, { name: 'C', email: 'c@e.com' }, ctx,
      );
      const inv = await callWithContext<{ id: string }>(
        router.invoicing.create,
        { clientId: client.id, taxRate: 0, dueDate: '2025-06-01' },
        ctx,
      );

      const updated = await callWithContext<{ lineItems: unknown[] }>(
        router.invoicing.addLineItem,
        { invoiceId: inv.id, description: 'Widget', quantity: 2, unitPriceCents: 1000 },
        ctx,
      );

      expect(updated.lineItems).toHaveLength(1);
    });

    it('returns INVALID_INPUT for nonexistent invoice', async () => {
      try {
        await callWithContext(
          router.invoicing.addLineItem,
          { invoiceId: 'inv_00000000-0000-0000-0000-000000000000', description: 'X', quantity: 1, unitPriceCents: 100 },
          ctx,
        );
        expect.fail('Should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(ORPCError);
        expect((e as AnyORPCError).code).toBe('INVALID_INPUT');
      }
    });
  });

  // -------------------------------------------------------------------------
  // Invoicing — send
  // -------------------------------------------------------------------------

  describe('invoicing.send', () => {
    it('sends a draft invoice with line items', async () => {
      const client = await callWithContext<{ id: string }>(
        router.clients.create, { name: 'C', email: 'c@e.com' }, ctx,
      );
      const inv = await callWithContext<{ id: string }>(
        router.invoicing.create,
        { clientId: client.id, taxRate: 0, dueDate: '2025-06-01' },
        ctx,
      );
      await callWithContext(
        router.invoicing.addLineItem,
        { invoiceId: inv.id, description: 'Widget', quantity: 1, unitPriceCents: 5000 },
        ctx,
      );

      const sent = await callWithContext<{ status: string }>(
        router.invoicing.send,
        { invoiceId: inv.id },
        ctx,
      );

      expect(sent.status).toBe('sent');
    });

    it('returns NO_LINE_ITEMS when sending empty invoice', async () => {
      const client = await callWithContext<{ id: string }>(
        router.clients.create, { name: 'C', email: 'c@e.com' }, ctx,
      );
      const inv = await callWithContext<{ id: string }>(
        router.invoicing.create,
        { clientId: client.id, taxRate: 0, dueDate: '2025-06-01' },
        ctx,
      );

      try {
        await callWithContext(router.invoicing.send, { invoiceId: inv.id }, ctx);
        expect.fail('Should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(ORPCError);
        expect((e as AnyORPCError).code).toBe('NO_LINE_ITEMS');
      }
    });
  });

  // -------------------------------------------------------------------------
  // Invoicing — recordPayment
  // -------------------------------------------------------------------------

  describe('invoicing.recordPayment', () => {
    async function createSentInvoice(c: RpcContext) {
      const client = await callWithContext<{ id: string }>(
        router.clients.create, { name: 'C', email: 'c@e.com' }, c,
      );
      const inv = await callWithContext<{ id: string }>(
        router.invoicing.create,
        { clientId: client.id, taxRate: 0, dueDate: '2025-06-01' },
        c,
      );
      await callWithContext(
        router.invoicing.addLineItem,
        { invoiceId: inv.id, description: 'Widget', quantity: 1, unitPriceCents: 10000 },
        c,
      );
      await callWithContext(router.invoicing.send, { invoiceId: inv.id }, c);
      return inv;
    }

    it('records a partial payment', async () => {
      const inv = await createSentInvoice(ctx);

      const result = await callWithContext<{ status: string; payments: unknown[] }>(
        router.invoicing.recordPayment,
        { invoiceId: inv.id, amountCents: 5000 },
        ctx,
      );

      expect(result.status).toBe('sent');
      expect(result.payments).toHaveLength(1);
    });

    it('transitions to paid on full payment', async () => {
      const inv = await createSentInvoice(ctx);

      const result = await callWithContext<{ status: string }>(
        router.invoicing.recordPayment,
        { invoiceId: inv.id, amountCents: 10000 },
        ctx,
      );

      expect(result.status).toBe('paid');
    });

    it('returns OVERPAYMENT for excess amount', async () => {
      const inv = await createSentInvoice(ctx);

      try {
        await callWithContext(
          router.invoicing.recordPayment,
          { invoiceId: inv.id, amountCents: 999999 },
          ctx,
        );
        expect.fail('Should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(ORPCError);
        expect((e as AnyORPCError).code).toBe('OVERPAYMENT');
      }
    });

    it('returns ALREADY_PAID after full payment', async () => {
      const inv = await createSentInvoice(ctx);
      await callWithContext(
        router.invoicing.recordPayment,
        { invoiceId: inv.id, amountCents: 10000 },
        ctx,
      );

      try {
        await callWithContext(
          router.invoicing.recordPayment,
          { invoiceId: inv.id, amountCents: 100 },
          ctx,
        );
        expect.fail('Should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(ORPCError);
        expect((e as AnyORPCError).code).toBe('ALREADY_PAID');
      }
    });
  });

  // -------------------------------------------------------------------------
  // Invoicing — void
  // -------------------------------------------------------------------------

  describe('invoicing.void', () => {
    it('voids a draft invoice', async () => {
      const client = await callWithContext<{ id: string }>(
        router.clients.create, { name: 'C', email: 'c@e.com' }, ctx,
      );
      const inv = await callWithContext<{ id: string }>(
        router.invoicing.create,
        { clientId: client.id, taxRate: 0, dueDate: '2025-06-01' },
        ctx,
      );

      const voided = await callWithContext<{ status: string }>(
        router.invoicing.void,
        { invoiceId: inv.id },
        ctx,
      );

      expect(voided.status).toBe('void');
    });

    it('returns INVOICE_VOIDED when voiding an already voided invoice', async () => {
      const client = await callWithContext<{ id: string }>(
        router.clients.create, { name: 'C', email: 'c@e.com' }, ctx,
      );
      const inv = await callWithContext<{ id: string }>(
        router.invoicing.create,
        { clientId: client.id, taxRate: 0, dueDate: '2025-06-01' },
        ctx,
      );
      await callWithContext(router.invoicing.void, { invoiceId: inv.id }, ctx);

      try {
        await callWithContext(router.invoicing.void, { invoiceId: inv.id }, ctx);
        expect.fail('Should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(ORPCError);
        expect((e as AnyORPCError).code).toBe('INVOICE_VOIDED');
      }
    });
  });

  // -------------------------------------------------------------------------
  // Invoicing — generatePdf
  // -------------------------------------------------------------------------

  describe('invoicing.generatePdf', () => {
    it('generates a PDF for an existing invoice', async () => {
      const client = await callWithContext<{ id: string }>(
        router.clients.create, { name: 'C', email: 'c@e.com' }, ctx,
      );
      const inv = await callWithContext<{ id: string }>(
        router.invoicing.create,
        { clientId: client.id, taxRate: 0.1, dueDate: '2025-06-01' },
        ctx,
      );

      const pdf = await callWithContext<{ size: number; magic: string }>(
        router.invoicing.generatePdf,
        { invoiceId: inv.id },
        ctx,
      );

      expect(pdf.size).toBeGreaterThan(0);
      expect(pdf.magic).toBe('25504446'); // %PDF in hex
    });

    it('returns INVOICE_NOT_FOUND for nonexistent invoice', async () => {
      try {
        await callWithContext(
          router.invoicing.generatePdf,
          { invoiceId: 'inv_00000000-0000-0000-0000-000000000000' },
          ctx,
        );
        expect.fail('Should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(ORPCError);
        expect((e as AnyORPCError).code).toBe('INVOICE_NOT_FOUND');
      }
    });
  });

  // -------------------------------------------------------------------------
  // Invoicing — calculateLateFee (feature-flagged)
  // -------------------------------------------------------------------------

  describe('invoicing.calculateLateFee', () => {
    async function createOverdueSentInvoice(c: RpcContext) {
      const client = await callWithContext<{ id: string }>(
        router.clients.create, { name: 'C', email: 'c@e.com' }, c,
      );
      const inv = await callWithContext<{ id: string }>(
        router.invoicing.create,
        { clientId: client.id, taxRate: 0, dueDate: '2025-01-01' },
        c,
      );
      await callWithContext(
        router.invoicing.addLineItem,
        { invoiceId: inv.id, description: 'Widget', quantity: 1, unitPriceCents: 100000 },
        c,
      );
      await callWithContext(router.invoicing.send, { invoiceId: inv.id }, c);
      return inv;
    }

    it('returns FEATURE_DISABLED when lateFees flag is off', async () => {
      const ctxFlagOff = buildTestContext({ lateFeesEnabled: false });
      const inv = await createOverdueSentInvoice(ctxFlagOff);

      try {
        await callWithContext(
          router.invoicing.calculateLateFee,
          { invoiceId: inv.id },
          ctxFlagOff,
        );
        expect.fail('Should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(ORPCError);
        expect((e as AnyORPCError).code).toBe('FEATURE_DISABLED');
      }
    });

    it('calculates late fee when flag is on and invoice is overdue', async () => {
      const ctxFlagOn = buildTestContext({ lateFeesEnabled: true });
      const inv = await createOverdueSentInvoice(ctxFlagOn);

      const result = await callWithContext<{ lineItems: { description: string }[] }>(
        router.invoicing.calculateLateFee,
        { invoiceId: inv.id },
        ctxFlagOn,
      );

      // Should have original line item + late fee
      expect(result.lineItems).toHaveLength(2);
      expect(result.lineItems[1]!.description).toMatch(/^Late fee \(\d+ days overdue\)$/);
    });

    it('returns NOT_OVERDUE when invoice is not overdue', async () => {
      const ctxFlagOn = buildTestContext({ lateFeesEnabled: true });
      // Create invoice with future due date
      const client = await callWithContext<{ id: string }>(
        router.clients.create, { name: 'C', email: 'c@e.com' }, ctxFlagOn,
      );
      const inv = await callWithContext<{ id: string }>(
        router.invoicing.create,
        { clientId: client.id, taxRate: 0, dueDate: '2025-12-01' },
        ctxFlagOn,
      );
      await callWithContext(
        router.invoicing.addLineItem,
        { invoiceId: inv.id, description: 'Widget', quantity: 1, unitPriceCents: 10000 },
        ctxFlagOn,
      );
      await callWithContext(router.invoicing.send, { invoiceId: inv.id }, ctxFlagOn);

      try {
        await callWithContext(
          router.invoicing.calculateLateFee,
          { invoiceId: inv.id },
          ctxFlagOn,
        );
        expect.fail('Should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(ORPCError);
        expect((e as AnyORPCError).code).toBe('NOT_OVERDUE');
      }
    });

    it('returns LATE_FEE_ALREADY_APPLIED on second attempt', async () => {
      const ctxFlagOn = buildTestContext({ lateFeesEnabled: true });
      const inv = await createOverdueSentInvoice(ctxFlagOn);

      // First: succeeds
      await callWithContext(
        router.invoicing.calculateLateFee,
        { invoiceId: inv.id },
        ctxFlagOn,
      );

      // Second: fails
      try {
        await callWithContext(
          router.invoicing.calculateLateFee,
          { invoiceId: inv.id },
          ctxFlagOn,
        );
        expect.fail('Should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(ORPCError);
        expect((e as AnyORPCError).code).toBe('LATE_FEE_ALREADY_APPLIED');
      }
    });
  });
});
