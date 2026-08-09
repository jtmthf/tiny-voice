/**
 * Transactional outbox port.
 *
 * Events are enqueued synchronously inside a database transaction
 * alongside the aggregate save. After the transaction commits,
 * `drain()` processes pending events through the real event bus.
 *
 * If the process crashes between commit and drain, events remain
 * in the outbox table and can be recovered manually or on next startup.
 *
 * Drain contract: every pending row is attempted. A row whose handler
 * rejects is retained and reported via `onError`; rows whose handlers
 * succeed are deleted. `drain()` itself never rejects because of a
 * handler failure.
 */
export interface Outbox<TEventMap extends object = object> {
  /** Synchronous — call inside a db.transaction() block. */
  enqueue<K extends keyof TEventMap & string>(eventName: K, payload: TEventMap[K]): void;

  /** Async — attempts every pending event via the handler; see drain contract above. */
  drain(
    handler: (
      eventName: keyof TEventMap & string,
      payload: TEventMap[keyof TEventMap],
    ) => Promise<void>,
    onError?: (eventName: string, error: unknown) => void,
  ): Promise<void>;
}
