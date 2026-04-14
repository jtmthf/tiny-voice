'use client';

import { useState, useTransition } from 'react';
import { sendInvoice, recordPayment, voidInvoice, generatePdf, calculateLateFee } from '@/app/lib/actions/index';
import { useRouter } from 'next/navigation';

export function InvoiceActions({ invoiceId, status, showLateFeeButton }: { invoiceId: string; status: string; showLateFeeButton?: boolean }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [paymentCents, setPaymentCents] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const handleSend = () => {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      try {
        const [err] = await sendInvoice({ invoiceId });
        if (err) throw new Error(err.message);
        setMessage('Invoice sent.');
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to send invoice.');
      }
    });
  };

  const handleRecordPayment = () => {
    setError(null);
    setMessage(null);
    const cents = parseInt(paymentCents, 10);
    if (!cents || cents <= 0) {
      setError('Enter a valid amount in cents.');
      return;
    }
    startTransition(async () => {
      try {
        const [err] = await recordPayment({ invoiceId, amountCents: cents });
        if (err) throw new Error(err.message);
        setMessage('Payment recorded.');
        setPaymentCents('');
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to record payment.');
      }
    });
  };

  const handleVoid = () => {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      try {
        const [err] = await voidInvoice({ invoiceId });
        if (err) throw new Error(err.message);
        setMessage('Invoice voided.');
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to void invoice.');
      }
    });
  };

  const handleCalculateLateFee = () => {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      try {
        const [err] = await calculateLateFee({ invoiceId });
        if (err) throw new Error(err.message);
        setMessage('Late fee applied.');
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to calculate late fee.');
      }
    });
  };

  const handleGeneratePdf = () => {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      try {
        const [err, data] = await generatePdf({ invoiceId });
        if (err) throw new Error(err.message);
        setMessage(`PDF generated (${data.size} bytes, magic: ${data.magic}).`);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to generate PDF.');
      }
    });
  };

  return (
    <div className="card" style={{ marginTop: '1rem' }}>
      <h3>Actions</h3>
      <div className="actions-row" style={{ flexWrap: 'wrap', alignItems: 'end' }}>
        {status === 'draft' && (
          <button onClick={handleSend} className="btn-primary" disabled={isPending}>
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
            <button onClick={handleRecordPayment} className="btn-primary" disabled={isPending}>
              Record Payment
            </button>
          </div>
        )}

        {showLateFeeButton && (
          <button onClick={handleCalculateLateFee} disabled={isPending}>
            Calculate Late Fee
          </button>
        )}

        {(status === 'draft' || status === 'sent') && (
          <button onClick={handleVoid} className="btn-danger" disabled={isPending}>
            Void
          </button>
        )}

        <button onClick={handleGeneratePdf} disabled={isPending}>
          Generate PDF
        </button>
      </div>

      {error && <p className="error-message" role="alert">{error}</p>}
      {message && <p role="status" style={{ color: 'var(--color-success)', fontSize: '0.875rem', marginTop: '0.5rem' }}>{message}</p>}
    </div>
  );
}
