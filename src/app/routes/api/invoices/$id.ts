import { createFileRoute } from '@tanstack/react-router';
import { getAppInstance } from '@/app/instance';
import { deleteInvoice } from '@/invoicing/commands/delete-invoice';
import { parseInvoiceId } from '@/shared/ids/invoice-id';

export const Route = createFileRoute('/api/invoices/$id')({
  server: {
    handlers: {
      DELETE: ({ params }) => {
        const app = getAppInstance();
        const invoiceId = parseInvoiceId(params.id);
        if (invoiceId.isErr()) {
          return new Response(JSON.stringify({ error: invoiceId.error }), { status: 400 });
        }
        const result = deleteInvoice({ repo: app.invoiceRepo }, { invoiceId: invoiceId.value });
        if (result.isErr()) {
          return new Response(JSON.stringify({ error: result.error }), { status: 400 });
        }
        return new Response(JSON.stringify({ ok: true }));
      },
    },
  },
});
