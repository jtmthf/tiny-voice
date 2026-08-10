import { createFileRoute } from '@tanstack/react-router';
import { getAppInstance } from '@/app/instance';
import { deleteClient } from '@/clients/commands/delete-client';
import { parseClientId } from '@/shared/ids/client-id';

export const Route = createFileRoute('/api/clients/$id')({
  server: {
    handlers: {
      DELETE: ({ params }) => {
        const app = getAppInstance();
        const clientId = parseClientId(params.id);
        if (clientId.isErr()) {
          return new Response(JSON.stringify({ error: clientId.error }), { status: 400 });
        }
        const result = deleteClient(
          { clientRepo: app.clientRepo, invoiceRepo: app.invoiceRepo },
          { clientId: clientId.value },
        );
        if (result.isErr()) {
          return new Response(JSON.stringify({ error: result.error }), { status: 400 });
        }
        return new Response(JSON.stringify({ ok: true }));
      },
    },
  },
});
