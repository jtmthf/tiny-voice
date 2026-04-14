import type { RpcContext } from './rpc-context';

/**
 * Holder for the lazily-initialized RPC context singleton.
 * Task 8 (composition root) will call `setRpcContext()` with the real deps.
 *
 * Until then, `getRpcContext()` throws a clear error directing the developer
 * to wire up `buildApp()`.
 */
let _ctx: RpcContext | null = null;

/**
 * Called by the composition root (task 8's `buildApp()`) to provide the
 * application-wide RPC context. Must be called once at app startup.
 */
export function setRpcContext(ctx: RpcContext): void {
  _ctx = ctx;
}

/**
 * Returns the current RPC context.
 * Throws if `setRpcContext` has not been called yet.
 */
export function getRpcContext(): RpcContext {
  if (!_ctx) {
    throw new Error(
      'RPC context not initialized. Call setRpcContext() from buildApp() (task 8).',
    );
  }
  return _ctx;
}
