import { describe, it, expect, beforeEach } from 'vitest';
import { buildTestApp } from './testing/build-test-app';
import type { AppDeps } from './app-deps';
import type { CapturingNotificationSender } from '@/invoicing/index';
import { newInvoiceId } from '@/shared/ids/invoice-id';
import { newClientId } from '@/shared/ids/client-id';
import { newPaymentId } from '@/shared/ids/payment-id';
import type { InvoiceSent, InvoicePaymentRecorded, InvoiceVoided } from '@/invoicing/index';

describe('subscribers', () => {
  let app: AppDeps;
  let notifications: CapturingNotificationSender;

  beforeEach(() => {
    const result = buildTestApp();
    app = result.app;
    notifications = result.capturing.notifications;
  });

  describe('InvoiceSent', () => {
    it('sends invoice notification', async () => {
      const event: InvoiceSent = {
        invoiceId: newInvoiceId(),
        clientId: newClientId(),
        totalCents: '10000',
        sentAt: '2026-04-13T00:00:00.000Z',
      };

      await app.eventBus.publish('InvoiceSent', event);

      expect(notifications.sent).toHaveLength(1);
      expect(notifications.sent[0]!.type).toBe('invoiceSent');
    });
  });

  describe('InvoicePaymentRecorded', () => {
    it('updates revenue read model and sends notification', async () => {
      const event: InvoicePaymentRecorded = {
        invoiceId: newInvoiceId(),
        paymentId: newPaymentId(),
        amountCents: '5000',
        becamePaid: false,
        recordedAt: '2026-04-13T00:00:00.000Z',
      };

      await app.eventBus.publish('InvoicePaymentRecorded', event);

      // Revenue projection updated
      const revenue = await app.revenueReadModel.getByMonth('2026-04' as import('@/shared/time/year-month').YearMonth);
      expect(revenue).not.toBeNull();
      expect(revenue!.total.cents).toBe(5000n);

      // Notification sent
      expect(notifications.sent).toHaveLength(1);
      expect(notifications.sent[0]!.type).toBe('paymentReceived');
    });
  });

  describe('InvoiceVoided', () => {
    it('does not send a notification', async () => {
      const event: InvoiceVoided = {
        invoiceId: newInvoiceId(),
        voidedAt: '2026-04-13T00:00:00.000Z',
      };

      await app.eventBus.publish('InvoiceVoided', event);

      expect(notifications.sent).toHaveLength(0);
    });
  });

  describe('unsubscribe', () => {
    it('stops all subscribers from firing after unsubscribe', async () => {
      app.unsubscribe();

      const event: InvoiceSent = {
        invoiceId: newInvoiceId(),
        clientId: newClientId(),
        totalCents: '10000',
        sentAt: '2026-04-13T00:00:00.000Z',
      };

      await app.eventBus.publish('InvoiceSent', event);

      expect(notifications.sent).toHaveLength(0);
    });
  });
});
