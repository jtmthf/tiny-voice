import { createFileRoute } from '@tanstack/react-router';
import { getAppInstance } from '@/app/instance';
import { deleteInvoice } from '@/invoicing/commands/delete-invoice';
import { parseInvoiceId } from '@/shared/ids/invoice-id';

export const Route = createFileRoute('/api/invoices/$id')({
  server: {
    handlers: {
      DELETE: async ({ params }) => {
        const app = getAppInstance();
        const result = deleteInvoice(
          { repo: app.invoiceRepo },
          { invoiceId: parseInvoiceId(params.id) },
        );
        if (result.isErr()) {
          return new Response(JSON.stringify({ error: result.error }), { status: 400 });
        }
        return new Response(JSON.stringify({ ok: true }));
      },
    },
  },
});
