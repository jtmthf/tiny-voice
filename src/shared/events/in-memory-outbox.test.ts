import { describe, it, expect } from 'vitest';
import { InMemoryOutbox } from './in-memory-outbox';

interface TestEventMap {
  Foo: { value: number };
  Bar: { value: number };
  Baz: { value: number };
}

describe('InMemoryOutbox', () => {
  it('drains events in FIFO order and leaves the queue empty on a second drain', async () => {
    const outbox = new InMemoryOutbox<TestEventMap>();
    outbox.enqueue('Foo', { value: 1 });
    outbox.enqueue('Bar', { value: 2 });
    outbox.enqueue('Baz', { value: 3 });

    const received: { name: string; value: number }[] = [];
    await outbox.drain((eventName, payload) => {
      received.push({ name: eventName, value: (payload as { value: number }).value });
      return Promise.resolve();
    });

    expect(received).toEqual([
      { name: 'Foo', value: 1 },
      { name: 'Bar', value: 2 },
      { name: 'Baz', value: 3 },
    ]);

    const secondDrainCalls: unknown[] = [];
    await outbox.drain((eventName, payload) => {
      secondDrainCalls.push({ eventName, payload });
      return Promise.resolve();
    });
    expect(secondDrainCalls).toHaveLength(0);
  });

  it('retains events when a handler throws, and delivers them on a later drain', async () => {
    const outbox = new InMemoryOutbox<TestEventMap>();
    outbox.enqueue('Foo', { value: 1 });
    outbox.enqueue('Bar', { value: 2 });

    await outbox
      .drain(() => Promise.reject(new Error('boom')))
      .catch(() => {
        /* deliberately not asserting reject/resolve here — see plan 004 */
      });

    const received: { name: string; value: number }[] = [];
    await outbox.drain((eventName, payload) => {
      received.push({ name: eventName, value: (payload as { value: number }).value });
      return Promise.resolve();
    });

    expect(received).toEqual([
      { name: 'Foo', value: 1 },
      { name: 'Bar', value: 2 },
    ]);
  });

  it('isolates a failing event: other events still deliver, the failing one is retained, onError fires, drain resolves', async () => {
    const outbox = new InMemoryOutbox<TestEventMap>();
    outbox.enqueue('Foo', { value: 1 });
    outbox.enqueue('Bar', { value: 2 });
    outbox.enqueue('Baz', { value: 3 });

    const received: string[] = [];
    const errors: { eventName: string; error: unknown }[] = [];

    await outbox.drain(
      (eventName) => {
        if (eventName === 'Bar') return Promise.reject(new Error('boom'));
        received.push(eventName);
        return Promise.resolve();
      },
      (eventName, error) => {
        errors.push({ eventName, error });
      },
    );

    expect(received).toEqual(['Foo', 'Baz']);
    expect(errors).toHaveLength(1);
    expect(errors[0]!.eventName).toBe('Bar');

    const secondDrainReceived: string[] = [];
    await outbox.drain((eventName) => {
      secondDrainReceived.push(eventName);
      return Promise.resolve();
    });
    expect(secondDrainReceived).toEqual(['Bar']);
  });
});
