import type { Outbox } from './outbox';

interface PendingEvent {
  eventName: string;
  payload: unknown;
}

export class InMemoryOutbox implements Outbox {
  private readonly pending: PendingEvent[] = [];

  enqueue(eventName: string, payload: unknown): void {
    this.pending.push({ eventName, payload });
  }

  async drain(handler: (eventName: string, payload: unknown) => Promise<void>): Promise<void> {
    let event = this.pending.shift();
    while (event) {
      await handler(event.eventName, event.payload);
      event = this.pending.shift();
    }
  }
}
