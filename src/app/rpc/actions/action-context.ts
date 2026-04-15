import { updateTag } from 'next/cache';
import type { RpcContext } from '../rpc-context';

/**
 * Shared helper: resolves the RPC context lazily for each Server Action call.
 * Uses dynamic import so that the context module is loaded only when an
 * action is actually invoked (not at action-file import time).
 */
export async function actionContext(): Promise<RpcContext> {
  const { getRpcContext } = await import('../get-rpc-context');
  return getRpcContext();
}

/**
 * Interceptor factory: after the action resolves successfully, invalidates the
 * given Next.js cache tags via `updateTag` so dependent RSC data-cache entries
 * are refreshed on the next read.
 */
export function withCacheInvalidation(...tags: string[]) {
  return async function <T>(options: { next(): Promise<T> }): Promise<T> {
    const result = await options.next();
    for (const tag of tags) updateTag(tag);
    return result;
  };
}
