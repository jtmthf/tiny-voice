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

  async drain(
    handler: (eventName: keyof TEventMap & string, payload: TEventMap[keyof TEventMap]) => Promise<void>,
    onError?: (eventName: string, error: unknown) => void,
  ): Promise<void> {
    const survivors: PendingEvent<TEventMap>[] = [];
    for (const event of this.pending) {
      try {
        await handler(event.eventName, event.payload);
      } catch (error) {
        onError?.(event.eventName, error);
        survivors.push(event);
      }
    }
    this.pending.length = 0;
    this.pending.push(...survivors);
  }
}
