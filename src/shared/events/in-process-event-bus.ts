import type { EventBus } from './event-bus';

type Handler = (payload: never) => Promise<void> | void;

/**
 * Default EventBus implementation.
 *
 * Error strategy: collect-and-rethrow. All subscribers run regardless
 * of individual failures. Errors are aggregated and thrown after all
 * subscribers complete, so callers can detect failures.
 */
export class InProcessEventBus<TEventMap extends object> implements EventBus<TEventMap> {
  private readonly handlers = new Map<string, Handler[]>();

  subscribe<K extends keyof TEventMap & string>(
    event: K,
    handler: (payload: TEventMap[K]) => Promise<void> | void,
  ): () => void {
    const list = this.handlers.get(event) ?? [];
    list.push(handler as Handler);
    this.handlers.set(event, list);

    // Return unsubscribe function
    return () => {
      const current = this.handlers.get(event);
      if (current) {
        const idx = current.indexOf(handler as Handler);
        if (idx !== -1) {
          current.splice(idx, 1);
        }
      }
    };
  }

  async publish<K extends keyof TEventMap & string>(event: K, payload: TEventMap[K]): Promise<void> {
    const list = this.handlers.get(event);
    if (!list || list.length === 0) return;

    const results = await Promise.allSettled(
      list.map(async (handler) => (handler as (payload: TEventMap[K]) => Promise<void> | void)(payload)),
    );

    const errors = results
      .filter((r): r is PromiseRejectedResult => r.status === 'rejected')
      .map((r) => r.reason);

    if (errors.length > 0) {
      throw new AggregateError(errors, `${errors.length} subscriber(s) failed for event "${event}"`);
    }
  }
}
