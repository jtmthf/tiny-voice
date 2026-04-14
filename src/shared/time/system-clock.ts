import type { Clock } from './clock';
import type { DueDate } from './due-date';
import { dueDateOf } from './due-date';

export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }

  today(): DueDate {
    return dueDateOf(this.now());
  }
}
