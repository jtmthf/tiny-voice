import type { Clock } from './clock';
import type { DueDate } from './due-date';
import { dueDateOf } from './due-date';

/**
 * Test adapter for Clock. Frozen at a given time, with `advance()` to move forward.
 */
export class FixedClock implements Clock {
  private current: Date;

  constructor(fixed: Date) {
    this.current = new Date(fixed.getTime());
  }

  now(): Date {
    return new Date(this.current.getTime());
  }

  today(): DueDate {
    return dueDateOf(this.current);
  }

  advance(ms: number): void {
    this.current = new Date(this.current.getTime() + ms);
  }
}
