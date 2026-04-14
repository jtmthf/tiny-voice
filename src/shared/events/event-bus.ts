/**
 * Typed in-process synchronous event dispatcher.
 *
 * Subscribers fire in registration order. If a subscriber throws,
 * the error is collected but does not prevent other subscribers from running.
 * After all subscribers have run, if any errors were collected, they are
 * thrown as an AggregateError. This ensures reliable delivery while
 * still surfacing failures.
 */
export interface EventBus<TEventMap extends Record<string, unknown>> {
  publish<K extends keyof TEventMap & string>(event: K, payload: TEventMap[K]): Promise<void>;
  subscribe<K extends keyof TEventMap & string>(event: K, handler: (payload: TEventMap[K]) => Promise<void> | void): () => void;
}
