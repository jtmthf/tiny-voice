import type { Outbox } from './outbox';

interface PendingEvent<TEventMap extends object> {
  eventName: keyof TEventMap & string;
  payload: TEventMap[keyof TEventMap];
}

export class InMemoryOutbox<TEventMap extends object = object> implements Outbox<TEventMap> {
  private readonly pending: PendingEvent<TEventMap>[] = [];

  enqueue<K extends keyof TEventMap & string>(eventName: K, payload: TEventMap[K]): void {
    this.pending.push({ eventName, payload });
  }

  async drain(handler: (eventName: keyof TEventMap & string, payload: TEventMap[keyof TEventMap]) => Promise<void>): Promise<void> {
    let event = this.pending.shift();
    while (event) {
      await handler(event.eventName, event.payload);
      event = this.pending.shift();
    }
  }
}
