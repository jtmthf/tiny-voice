import type { EventBus } from '@/shared/events/event-bus';
import { Money } from '@/shared/money/money';
import type { Logger } from '@/shared/logger/logger';
import { yearMonthOf } from '@/shared/time/year-month';
import type { InvoicingEventMap } from '@/invoicing/index';
import type { RevenueReadModel } from '../ports/revenue-read-model';

/**
 * Subscribes to InvoicePaymentRecorded events and projects them into the
 * revenue read model. Returns an unsubscribe function for teardown.
 */
export function registerRevenueProjection(deps: {
  eventBus: EventBus<InvoicingEventMap>;
  readModel: RevenueReadModel;
  logger: Logger;
}): () => void {
  return deps.eventBus.subscribe('InvoicePaymentRecorded', (payload) => {
    const recordedAt = new Date(payload.recordedAt);
    const month = yearMonthOf(recordedAt);
    const amount = Money.fromCents(BigInt(payload.amountCents));
    deps.readModel.recordPayment({ month, amount, at: recordedAt });
    deps.logger.info('revenue.projection.updated', { month, invoiceId: payload.invoiceId });
  });
}
