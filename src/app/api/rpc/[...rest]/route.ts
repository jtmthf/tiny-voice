import { RPCHandler } from '@orpc/server/fetch';
import { router } from '@/app/rpc/router';
import { getRpcContext } from '@/app/rpc/get-rpc-context';

const handler = new RPCHandler(router);

async function handleRequest(request: Request): Promise<Response> {
  const { matched, response } = await handler.handle(request, {
    prefix: '/api/rpc',
    context: getRpcContext(),
  });

  if (matched && response) {
    return response;
  }

  return new Response('Not Found', { status: 404 });
}

export { handleRequest as GET, handleRequest as POST };
