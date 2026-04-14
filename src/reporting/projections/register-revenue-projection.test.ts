import { describe, it, expect } from 'vitest';
import { InProcessEventBus } from '@/shared/events/in-process-event-bus';
import { newInvoiceId } from '@/shared/ids/invoice-id';
import { newPaymentId } from '@/shared/ids/payment-id';
import type { Logger } from '@/shared/logger/logger';
import type { YearMonth } from '@/shared/time/year-month';
import type { InvoicingEventMap, InvoicePaymentRecorded } from '@/invoicing/index';
import { InMemoryRevenueReadModel } from '../adapters/in-memory-revenue-read-model';
import { registerRevenueProjection } from './register-revenue-projection';

const SILENT_LOGGER: Logger = {
  info() { /* noop */ },
  warn() { /* noop */ },
  error() { /* noop */ },
  debug() { /* noop */ },
};

function buildPaymentEvent(overrides?: Partial<InvoicePaymentRecorded>): InvoicePaymentRecorded {
  return {
    invoiceId: newInvoiceId(),
    paymentId: newPaymentId(),
    amountCents: 10000n,
    becamePaid: false,
    recordedAt: new Date('2025-01-15'),
    ...overrides,
  };
}

describe('registerRevenueProjection', () => {
  it('projects a single payment event into the read model', async () => {
    const eventBus = new InProcessEventBus<InvoicingEventMap>();
    const readModel = new InMemoryRevenueReadModel();
    registerRevenueProjection({ eventBus, readModel, logger: SILENT_LOGGER });

    await eventBus.publish('InvoicePaymentRecorded', buildPaymentEvent());

    const result = readModel.getByMonth('2025-01' as YearMonth);
    expect(result).not.toBeNull();
    expect(result!.total.cents).toBe(10000n);
    expect(result!.paymentCount).toBe(1);
  });

  it('projects two payments in different months into separate rows', async () => {
    const eventBus = new InProcessEventBus<InvoicingEventMap>();
    const readModel = new InMemoryRevenueReadModel();
    registerRevenueProjection({ eventBus, readModel, logger: SILENT_LOGGER });

    await eventBus.publish(
      'InvoicePaymentRecorded',
      buildPaymentEvent({ recordedAt: new Date('2025-01-10'), amountCents: 5000n }),
    );
    await eventBus.publish(
      'InvoicePaymentRecorded',
      buildPaymentEvent({ recordedAt: new Date('2025-02-20'), amountCents: 3000n }),
    );

    const jan = readModel.getByMonth('2025-01' as YearMonth);
    const feb = readModel.getByMonth('2025-02' as YearMonth);
    expect(jan!.total.cents).toBe(5000n);
    expect(feb!.total.cents).toBe(3000n);
  });

  it('aggregates two payments in the same month', async () => {
    const eventBus = new InProcessEventBus<InvoicingEventMap>();
    const readModel = new InMemoryRevenueReadModel();
    registerRevenueProjection({ eventBus, readModel, logger: SILENT_LOGGER });

    await eventBus.publish(
      'InvoicePaymentRecorded',
      buildPaymentEvent({ recordedAt: new Date('2025-03-05'), amountCents: 2000n }),
    );
    await eventBus.publish(
      'InvoicePaymentRecorded',
      buildPaymentEvent({ recordedAt: new Date('2025-03-25'), amountCents: 7000n }),
    );

    const mar = readModel.getByMonth('2025-03' as YearMonth);
    expect(mar!.total.cents).toBe(9000n);
    expect(mar!.paymentCount).toBe(2);
  });

  it('unsubscribe stops further projections', async () => {
    const eventBus = new InProcessEventBus<InvoicingEventMap>();
    const readModel = new InMemoryRevenueReadModel();
    const unsub = registerRevenueProjection({ eventBus, readModel, logger: SILENT_LOGGER });

    await eventBus.publish('InvoicePaymentRecorded', buildPaymentEvent());
    unsub();
    await eventBus.publish(
      'InvoicePaymentRecorded',
      buildPaymentEvent({ amountCents: 99999n }),
    );

    const result = readModel.getByMonth('2025-01' as YearMonth);
    expect(result!.total.cents).toBe(10000n); // only the first event
    expect(result!.paymentCount).toBe(1);
  });
});
