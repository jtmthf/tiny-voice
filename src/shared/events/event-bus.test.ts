import { describe, expect, it } from 'vitest';
import { InProcessEventBus } from './in-process-event-bus';

// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
type TestEvents = {
  userCreated: { id: string; name: string };
  orderPlaced: { orderId: string };
};

describe('InProcessEventBus', () => {
  it('delivers to multiple subscribers in order', async () => {
    const bus = new InProcessEventBus<TestEvents>();
    const calls: string[] = [];

    bus.subscribe('userCreated', (p) => { calls.push(`first:${p.name}`); });
    bus.subscribe('userCreated', (p) => { calls.push(`second:${p.name}`); });

    await bus.publish('userCreated', { id: '1', name: 'Alice' });

    expect(calls).toEqual(['first:Alice', 'second:Alice']);
  });

  it('unsubscribe prevents further delivery', async () => {
    const bus = new InProcessEventBus<TestEvents>();
    const calls: string[] = [];

    const unsub = bus.subscribe('userCreated', () => { calls.push('called'); });
    unsub();

    await bus.publish('userCreated', { id: '1', name: 'Bob' });
    expect(calls).toEqual([]);
  });

  it('error in one subscriber does not block others', async () => {
    const bus = new InProcessEventBus<TestEvents>();
    const calls: string[] = [];

    bus.subscribe('userCreated', () => { throw new Error('boom'); });
    bus.subscribe('userCreated', (p) => { calls.push(p.name); });

    await expect(bus.publish('userCreated', { id: '1', name: 'Charlie' })).rejects.toThrow(AggregateError);

    // Second subscriber still ran
    expect(calls).toEqual(['Charlie']);
  });

  it('publish resolves when no subscribers', async () => {
    const bus = new InProcessEventBus<TestEvents>();
    await expect(bus.publish('orderPlaced', { orderId: '123' })).resolves.toBeUndefined();
  });

  it('supports async subscribers', async () => {
    const bus = new InProcessEventBus<TestEvents>();
    const calls: string[] = [];

    bus.subscribe('orderPlaced', async (p) => {
      await Promise.resolve();
      calls.push(p.orderId);
    });

    await bus.publish('orderPlaced', { orderId: 'abc' });
    expect(calls).toEqual(['abc']);
  });
});
