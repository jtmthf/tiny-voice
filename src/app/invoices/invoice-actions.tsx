import { useMutation, useQueryClient } from '@tanstack/react-query';
import { sendInvoiceFn } from '@/app/fns/send-invoice';
import { recordPaymentFn } from '@/app/fns/record-payment';
import { voidInvoiceFn } from '@/app/fns/void-invoice';
import { calculateLateFeeFn } from '@/app/fns/calculate-late-fee';
import { generatePdfFn } from '@/app/fns/generate-pdf';

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

interface Props {
  invoiceId: string;
  status: string;
  showLateFeeButton?: boolean;
  onSuccess?: () => void;
}

export function InvoiceActions({ invoiceId, status, showLateFeeButton, onSuccess }: Props) {
  const queryClient = useQueryClient();

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['invoices'] });
    onSuccess?.();
  };

  const sendMutation = useMutation({
    mutationFn: () => sendInvoiceFn({ data: { invoiceId } }),
    onSuccess: invalidate,
  });

  const recordMutation = useMutation({
    mutationFn: (amountCents: string) => recordPaymentFn({ data: { invoiceId, amountCents } }),
    onSuccess: invalidate,
  });

  const voidMutation = useMutation({
    mutationFn: () => voidInvoiceFn({ data: { invoiceId } }),
    onSuccess: invalidate,
  });

  const lateFeeMutation = useMutation({
    mutationFn: () => calculateLateFeeFn({ data: { invoiceId } }),
    onSuccess: invalidate,
  });

  const pdfMutation = useMutation({
    mutationFn: () => generatePdfFn({ data: { invoiceId } }),
    onSuccess: (d) => triggerDownload(d.bytesBase64, d.contentType, d.filenameSuggestion),
  });

  const isPending = [sendMutation, recordMutation, voidMutation, lateFeeMutation, pdfMutation].some(
    (m) => m.isPending,
  );

  const errorMessage =
    sendMutation.data?.error ??
    recordMutation.data?.error ??
    voidMutation.data?.error ??
    lateFeeMutation.data?.error ??
    sendMutation.error?.message ??
    recordMutation.error?.message ??
    voidMutation.error?.message ??
    lateFeeMutation.error?.message ??
    pdfMutation.error?.message ??
    null;

  return (
    <div className="card mt-md">
      <h3>Actions</h3>
      <div className="actions-row" style={{ flexWrap: 'wrap', alignItems: 'end' }}>
        {status === 'draft' && (
          <form
            action={sendInvoiceFn.url}
            method="POST"
            onSubmit={(e) => {
              e.preventDefault();
              sendMutation.mutate();
            }}
          >
            <input type="hidden" name="invoiceId" value={invoiceId} />
            <button type="submit" className="btn-primary" disabled={isPending}>
              Send Invoice
            </button>
          </form>
        )}

        {status === 'sent' && (
          <form
            action={recordPaymentFn.url}
            method="POST"
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              const amountCents = fd.get('amountCents') as string;
              recordMutation.mutate(amountCents);
            }}
          >
            <input type="hidden" name="invoiceId" value={invoiceId} />
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'end' }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label htmlFor="amountCents" className="text-xs">
                  Amount (cents)
                </label>
                <input
                  id="amountCents"
                  name="amountCents"
                  type="number"
                  min="1"
                  style={{ width: '120px' }}
                />
              </div>
              <button type="submit" className="btn-primary" disabled={isPending}>
                Record Payment
              </button>
            </div>
          </form>
        )}

        {showLateFeeButton && (
          <form
            action={calculateLateFeeFn.url}
            method="POST"
            onSubmit={(e) => {
              e.preventDefault();
              lateFeeMutation.mutate();
            }}
          >
            <input type="hidden" name="invoiceId" value={invoiceId} />
            <button type="submit" disabled={isPending}>
              Calculate Late Fee
            </button>
          </form>
        )}

        {(status === 'draft' || status === 'sent') && (
          <form
            action={voidInvoiceFn.url}
            method="POST"
            onSubmit={(e) => {
              e.preventDefault();
              voidMutation.mutate();
            }}
          >
            <input type="hidden" name="invoiceId" value={invoiceId} />
            <button type="submit" className="btn-danger" disabled={isPending}>
              Void
            </button>
          </form>
        )}

        <form
          action={generatePdfFn.url}
          method="POST"
          onSubmit={(e) => {
            e.preventDefault();
            pdfMutation.mutate();
          }}
        >
          <input type="hidden" name="invoiceId" value={invoiceId} />
          <button type="submit" disabled={isPending}>
            Generate PDF
          </button>
        </form>
      </div>

      {errorMessage && (
        <p className="error-message" role="alert">
          {errorMessage}
        </p>
      )}
    </div>
  );
}
