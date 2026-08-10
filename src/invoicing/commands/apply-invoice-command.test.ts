import { describe, it, expect } from 'vitest';
import { err, ok } from 'neverthrow';
import type { Database } from '@/shared/db/database';
import { InProcessEventBus } from '@/shared/events/in-process-event-bus';
import { InMemoryOutbox } from '@/shared/events/in-memory-outbox';
import { newInvoiceId } from '@/shared/ids/invoice-id';
import { newLineItemId } from '@/shared/ids/line-item-id';
import { newPaymentId } from '@/shared/ids/payment-id';
import { Money } from '@/shared/money/money';
import type { DueDate } from '@/shared/time/due-date';
import { addLateFee, recordPayment, sendInvoice, voidInvoice, total } from '../entities/invoice';
import { InvoiceError as IE } from '../errors/invoice-error';
import type { InvoicingEventMap } from '../events/invoicing-event-map';
import { InMemoryInvoiceRepo } from '../adapters/in-memory-invoice-repo';
import { buildDraftInvoice, buildLineItem, buildSentInvoice } from '../testing/invoice-factory';
import { applyInvoiceCommand } from './apply-invoice-command';
import type { InvoiceTransition } from './apply-invoice-command';

const STUB_DB: Database = {
  prepare() {
    throw new Error('Stub DB');
  },
  exec() {
    throw new Error('Stub DB');
  },
  transaction<T>(fn: () => T): T {
    return fn();
  },
  close() {
    /* noop */
  },
};

const NOW = new Date('2025-01-20T10:00:00Z');

describe('applyInvoiceCommand', () => {
  it('persists the aggregate, enqueues events from the outcome, and drains', async () => {
    const repo = new InMemoryInvoiceRepo();
    const eventBus = new InProcessEventBus<InvoicingEventMap>();
    const outbox = new InMemoryOutbox<InvoicingEventMap>();
    const published: InvoicingEventMap['InvoiceSent'][] = [];
    eventBus.subscribe('InvoiceSent', (e) => {
      published.push(e);
    });

    const invoice = buildDraftInvoice({ lineItems: [buildLineItem()] });
    repo.save(invoice);

    const result = await applyInvoiceCommand(
      { db: STUB_DB, repo, outbox, eventBus },
      { invoiceId: invoice.id },
      (inv) => sendInvoice(inv, NOW),
    );

    expect(result.isOk()).toBe(true);
    if (result.isOk()) expect(result.value.status).toBe('sent');
    expect(repo.findById(invoice.id)?.status).toBe('sent');
    expect(published).toHaveLength(1);
    expect(published[0]!.invoiceId).toBe(invoice.id);
    expect(published[0]!.sentAt).toBe(NOW.toISOString());
    expect(published[0]!.totalCents).toBe(total(invoice).cents.toString());
  });

  it('drains every event the outcome carries (record-payment path)', async () => {
    const repo = new InMemoryInvoiceRepo();
    const eventBus = new InProcessEventBus<InvoicingEventMap>();
    const outbox = new InMemoryOutbox<InvoicingEventMap>();
    const recorded: InvoicingEventMap['InvoicePaymentRecorded'][] = [];
    eventBus.subscribe('InvoicePaymentRecorded', (e) => {
      recorded.push(e);
    });

    const sent = buildSentInvoice();
    repo.save(sent);
    const paymentId = newPaymentId();
    const fullAmount = total(sent);

    const result = await applyInvoiceCommand(
      { db: STUB_DB, repo, outbox, eventBus },
      { invoiceId: sent.id },
      (inv) =>
        recordPayment(inv, {
          id: paymentId,
          amount: fullAmount,
          recordedAt: NOW,
        }),
    );

    expect(result.isOk()).toBe(true);
    if (result.isOk()) expect(result.value.status).toBe('paid');
    expect(recorded).toHaveLength(1);
    expect(recorded[0]).toEqual({
      invoiceId: sent.id,
      paymentId,
      amountCents: fullAmount.cents.toString(),
      becamePaid: true,
      recordedAt: NOW.toISOString(),
    });
  });

  it('publishes InvoiceVoided when the outcome includes one', async () => {
    const repo = new InMemoryInvoiceRepo();
    const eventBus = new InProcessEventBus<InvoicingEventMap>();
    const outbox = new InMemoryOutbox<InvoicingEventMap>();
    const voided: InvoicingEventMap['InvoiceVoided'][] = [];
    eventBus.subscribe('InvoiceVoided', (e) => {
      voided.push(e);
    });

    const sent = buildSentInvoice();
    repo.save(sent);

    const result = await applyInvoiceCommand(
      { db: STUB_DB, repo, outbox, eventBus },
      { invoiceId: sent.id },
      (inv) => voidInvoice(inv, NOW),
    );

    expect(result.isOk()).toBe(true);
    expect(voided).toEqual([{ invoiceId: sent.id, voidedAt: NOW.toISOString() }]);
  });

  it('persists but does not drain when the outcome has no events', async () => {
    const repo = new InMemoryInvoiceRepo();
    const eventBus = new InProcessEventBus<InvoicingEventMap>();
    const outbox = new InMemoryOutbox<InvoicingEventMap>();

    let drainCount = 0;
    const trackingOutbox = new Proxy(outbox, {
      get(target, prop) {
        if (prop === 'drain') {
          return async (...args: Parameters<typeof outbox.drain>) => {
            drainCount += 1;
            return target.drain(...args);
          };
        }
        return Reflect.get(target, prop);
      },
    });

    const sent = buildSentInvoice({ dueDate: '2025-01-01' as DueDate });
    repo.save(sent);

    const result = await applyInvoiceCommand(
      { db: STUB_DB, repo, outbox: trackingOutbox, eventBus },
      { invoiceId: sent.id },
      (inv) => addLateFee(inv, '2025-02-15' as DueDate, newLineItemId()),
    );

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.lineItems.some((li) => li.kind === 'lateFee')).toBe(true);
    }
    expect(repo.findById(sent.id)?.lineItems.some((li) => li.kind === 'lateFee')).toBe(true);
    expect(drainCount).toBe(0);
  });

  it('short-circuits when the transition fails: no save, no enqueue, no publish', async () => {
    const repo = new InMemoryInvoiceRepo();
    const eventBus = new InProcessEventBus<InvoicingEventMap>();
    const outbox = new InMemoryOutbox<InvoicingEventMap>();
    const published: unknown[] = [];
    eventBus.subscribe('InvoiceSent', (e) => {
      published.push(e);
    });

    const invoice = buildDraftInvoice({ lineItems: [buildLineItem()] });
    repo.save(invoice);
    const originalVersion = repo.findById(invoice.id)!.version;

    let outboxEnqueued = 0;
    const trackingOutbox = new Proxy(outbox, {
      get(target, prop) {
        if (prop === 'enqueue') {
          return (...args: Parameters<typeof outbox.enqueue>) => {
            outboxEnqueued += 1;
            target.enqueue(...args);
          };
        }
        return Reflect.get(target, prop);
      },
    });

    const failingTransition: InvoiceTransition = () => err(IE.noLineItems());

    const result = await applyInvoiceCommand(
      { db: STUB_DB, repo, outbox: trackingOutbox, eventBus },
      { invoiceId: invoice.id },
      failingTransition,
    );

    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error.kind).toBe('NoLineItems');
    expect(repo.findById(invoice.id)!.version).toBe(originalVersion);
    expect(outboxEnqueued).toBe(0);
    expect(published).toHaveLength(0);
  });

  it('returns InvalidInput when the invoice does not exist', async () => {
    const repo = new InMemoryInvoiceRepo();
    const eventBus = new InProcessEventBus<InvoicingEventMap>();
    const outbox = new InMemoryOutbox<InvoicingEventMap>();

    const result = await applyInvoiceCommand(
      { db: STUB_DB, repo, outbox, eventBus },
      { invoiceId: newInvoiceId() },
      (inv) => sendInvoice(inv, NOW),
    );

    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error.kind).toBe('InvalidInput');
  });

  it('propagates concurrency conflicts from repo.save and skips drain', async () => {
    const repo = new InMemoryInvoiceRepo();
    const eventBus = new InProcessEventBus<InvoicingEventMap>();
    const outbox = new InMemoryOutbox<InvoicingEventMap>();
    const published: unknown[] = [];
    eventBus.subscribe('InvoiceSent', (e) => {
      published.push(e);
    });

    const invoice = buildDraftInvoice({ lineItems: [buildLineItem()] });
    repo.save(invoice);

    const conflictingRepo = new Proxy(repo, {
      get(target, prop) {
        if (prop === 'save') return () => err(IE.concurrencyConflict());
        return Reflect.get(target, prop);
      },
    });

    const result = await applyInvoiceCommand(
      { db: STUB_DB, repo: conflictingRepo, outbox, eventBus },
      { invoiceId: invoice.id },
      (inv) => sendInvoice(inv, NOW),
    );

    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error.kind).toBe('ConcurrencyConflict');
    expect(published).toHaveLength(0);
  });

  it('routes each event through outbox.enqueue with the right name/payload pair', async () => {
    const repo = new InMemoryInvoiceRepo();
    const eventBus = new InProcessEventBus<InvoicingEventMap>();
    const outbox = new InMemoryOutbox<InvoicingEventMap>();
    const enqueueCalls: { name: string; payload: unknown }[] = [];
    const trackingOutbox = new Proxy(outbox, {
      get(target, prop) {
        if (prop === 'enqueue') {
          return (name: string, payload: unknown) => {
            enqueueCalls.push({ name, payload });
            ;(target.enqueue as (n: string, p: unknown) => void)(name, payload);
          };
        }
        return Reflect.get(target, prop);
      },
    });

    // A custom transition that emits two events to prove the dispatcher enqueues each.
    const sent = buildSentInvoice();
    repo.save(sent);
    const paymentId = newPaymentId();
    const transition: InvoiceTransition = (inv) => {
      const payResult = recordPayment(inv, {
        id: paymentId,
        amount: Money.fromCents(1n),
        recordedAt: NOW,
      });
      if (payResult.isErr()) return err(payResult.error);
      return ok({
        aggregate: payResult.value.aggregate,
        events: [
          ...payResult.value.events,
          { type: 'InvoiceVoided', payload: { invoiceId: sent.id, voidedAt: NOW.toISOString() } },
        ],
      });
    };

    const result = await applyInvoiceCommand(
      { db: STUB_DB, repo, outbox: trackingOutbox, eventBus },
      { invoiceId: sent.id },
      transition,
    );

    expect(result.isOk()).toBe(true);
    expect(enqueueCalls.map((c) => c.name)).toEqual(['InvoicePaymentRecorded', 'InvoiceVoided']);
  });
});
