import type { DueDate } from './due-date';

/**
 * Port interface for obtaining the current time.
 * Real adapter: SystemClock. Test adapter: FixedClock.
 */
export interface Clock {
  now(): Date;
  today(): DueDate;
}
