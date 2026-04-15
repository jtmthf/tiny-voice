import type { RpcContext } from './rpc-context';

let _ctxProvider: (() => RpcContext) | null = null;

/**
 * Called by the composition root (`buildApp()`) to register a lazy provider
 * for the RPC context. Replaces any previously registered provider.
 */
export function setRpcContextProvider(provider: () => RpcContext): void {
  _ctxProvider = provider;
}

/**
 * Returns the current RPC context via the registered provider.
 * Throws if `setRpcContextProvider` has not been called yet.
 */
export function getRpcContext(): RpcContext {
  if (!_ctxProvider) {
    throw new Error(
      'RPC context provider not set. Ensure buildApp() has run before handling a request.',
    );
  }
  return _ctxProvider();
}
