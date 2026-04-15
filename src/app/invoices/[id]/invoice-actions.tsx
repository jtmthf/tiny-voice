'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useServerAction } from '@orpc/react/hooks';
import { onSuccessDeferred } from '@orpc/react';
import { actions } from '@/app/rpc/actions';

export function InvoiceActions({ invoiceId, status, showLateFeeButton }: { invoiceId: string; status: string; showLateFeeButton?: boolean }) {
  const router = useRouter();
  const [paymentCents, setPaymentCents] = useState('');

  const refresh = () => { router.refresh(); };

  const send = useServerAction(actions.invoicing.send, { interceptors: [onSuccessDeferred(refresh)] });
  const record = useServerAction(actions.invoicing.recordPayment, { interceptors: [onSuccessDeferred(refresh)] });
  const voidAction = useServerAction(actions.invoicing.void, { interceptors: [onSuccessDeferred(refresh)] });
  const lateFee = useServerAction(actions.invoicing.calculateLateFee, { interceptors: [onSuccessDeferred(refresh)] });
  const pdf = useServerAction(actions.invoicing.generatePdf);

  const isPending = send.isPending || record.isPending || voidAction.isPending || lateFee.isPending || pdf.isPending;
  const error = send.error ?? record.error ?? voidAction.error ?? lateFee.error ?? pdf.error;

  return (
    <div className="card" style={{ marginTop: '1rem' }}>
      <h3>Actions</h3>
      <div className="actions-row" style={{ flexWrap: 'wrap', alignItems: 'end' }}>
        {status === 'draft' && (
          <button onClick={() => void send.execute({ invoiceId })} className="btn-primary" disabled={isPending}>
            Send Invoice
          </button>
        )}

        {(status === 'sent') && (
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'end' }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label htmlFor="paymentCents" style={{ fontSize: '0.75rem' }}>Amount (cents)</label>
              <input
                id="paymentCents"
                type="number"
                min="1"
                value={paymentCents}
                onChange={(e) => setPaymentCents(e.target.value)}
                style={{ width: '120px' }}
              />
            </div>
            <button
              onClick={() => {
                const cents = parseInt(paymentCents, 10);
                if (!cents || cents <= 0) return;
                void record.execute({ invoiceId, amountCents: cents });
                setPaymentCents('');
              }}
              className="btn-primary"
              disabled={isPending}
            >
              Record Payment
            </button>
          </div>
        )}

        {showLateFeeButton && (
          <button onClick={() => void lateFee.execute({ invoiceId })} disabled={isPending}>
            Calculate Late Fee
          </button>
        )}

        {(status === 'draft' || status === 'sent') && (
          <button onClick={() => void voidAction.execute({ invoiceId })} className="btn-danger" disabled={isPending}>
            Void
          </button>
        )}

        <button onClick={() => void pdf.execute({ invoiceId })} disabled={isPending}>
          Generate PDF
        </button>
      </div>

      {error && <p className="error-message" role="alert">{error.message}</p>}
      {send.isSuccess && <p role="status" style={{ color: 'var(--color-success)', fontSize: '0.875rem', marginTop: '0.5rem' }}>Invoice sent.</p>}
      {record.isSuccess && <p role="status" style={{ color: 'var(--color-success)', fontSize: '0.875rem', marginTop: '0.5rem' }}>Payment recorded.</p>}
      {voidAction.isSuccess && <p role="status" style={{ color: 'var(--color-success)', fontSize: '0.875rem', marginTop: '0.5rem' }}>Invoice voided.</p>}
      {lateFee.isSuccess && <p role="status" style={{ color: 'var(--color-success)', fontSize: '0.875rem', marginTop: '0.5rem' }}>Late fee applied.</p>}
      {pdf.isSuccess && <p role="status" style={{ color: 'var(--color-success)', fontSize: '0.875rem', marginTop: '0.5rem' }}>PDF generated ({pdf.data.size} bytes, magic: {pdf.data.magic}).</p>}
    </div>
  );
}
