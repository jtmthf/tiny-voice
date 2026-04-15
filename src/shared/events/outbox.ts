/**
 * Transactional outbox port.
 *
 * Events are enqueued synchronously inside a database transaction
 * alongside the aggregate save. After the transaction commits,
 * `drain()` processes pending events through the real event bus.
 *
 * If the process crashes between commit and drain, events remain
 * in the outbox table and can be recovered manually or on next startup.
 */
export interface Outbox<TEventMap extends object = object> {
  /** Synchronous — call inside a db.transaction() block. */
  enqueue<K extends keyof TEventMap & string>(eventName: K, payload: TEventMap[K]): void;

  /** Async — reads pending events, processes them via the handler, then deletes them. */
  drain(handler: (eventName: keyof TEventMap & string, payload: TEventMap[keyof TEventMap]) => Promise<void>): Promise<void>;
}
