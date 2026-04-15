'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useServerAction } from '@orpc/react/hooks';
import { onSuccessDeferred } from '@orpc/react';
import { invoicingSend } from '@/app/rpc/actions/invoicing-send';
import { invoicingRecordPayment } from '@/app/rpc/actions/invoicing-record-payment';
import { invoicingVoid } from '@/app/rpc/actions/invoicing-void';
import { invoicingCalculateLateFee } from '@/app/rpc/actions/invoicing-calculate-late-fee';
import { invoicingGeneratePdf } from '@/app/rpc/actions/invoicing-generate-pdf';

function triggerDownload(bytesBase64: string, contentType: string, filename: string): void {
  const raw = atob(bytesBase64);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) {
    bytes[i] = raw.charCodeAt(i);
  }
  const blob = new Blob([bytes], { type: contentType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function InvoiceActions({ invoiceId, status, showLateFeeButton }: { invoiceId: string; status: string; showLateFeeButton?: boolean }) {
  const router = useRouter();
  const [paymentCents, setPaymentCents] = useState('');

  const refresh = useCallback(() => { router.refresh(); }, [router]);

  const send = useServerAction(invoicingSend, { interceptors: [onSuccessDeferred(refresh)] });
  const record = useServerAction(invoicingRecordPayment, { interceptors: [onSuccessDeferred(refresh)] });
  const voidAction = useServerAction(invoicingVoid, { interceptors: [onSuccessDeferred(refresh)] });
  const lateFee = useServerAction(invoicingCalculateLateFee, { interceptors: [onSuccessDeferred(refresh)] });
  const pdf = useServerAction(invoicingGeneratePdf);

  useEffect(() => {
    if (pdf.isSuccess && pdf.data) {
      triggerDownload(pdf.data.bytesBase64, pdf.data.contentType, pdf.data.filenameSuggestion);
    }
  }, [pdf.isSuccess, pdf.data]);

  const allActions = { send, record, voidAction, lateFee, pdf };
  const isPending = Object.values(allActions).some(a => a.isPending);
  const error = Object.values(allActions).map(a => a.error).find(Boolean) ?? null;

  return (
    <div className="card mt-md">
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
              <label htmlFor="paymentCents" className="text-xs">Amount (cents)</label>
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
                void record.execute({ invoiceId, amountCents: String(cents) });
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
      {send.isSuccess && <p role="status" className="success-message">Invoice sent.</p>}
      {record.isSuccess && <p role="status" className="success-message">Payment recorded.</p>}
      {voidAction.isSuccess && <p role="status" className="success-message">Invoice voided.</p>}
      {lateFee.isSuccess && <p role="status" className="success-message">Late fee applied.</p>}
      {pdf.isSuccess && <p role="status" className="success-message">PDF downloaded.</p>}
    </div>
  );
}
