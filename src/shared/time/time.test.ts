import { describe, expect, it } from 'vitest';
import { SystemClock } from './system-clock';
import { FixedClock } from './fixed-clock';
import { dueDateOf, isOverdue, DueDateSchema } from './due-date';
import { yearMonthOf, YearMonthSchema } from './year-month';
import type { DueDate } from './due-date';

describe('SystemClock', () => {
  it('returns a Date close to now', () => {
    const clock = new SystemClock();
    const before = Date.now();
    const now = clock.now().getTime();
    const after = Date.now();
    expect(now).toBeGreaterThanOrEqual(before);
    expect(now).toBeLessThanOrEqual(after);
  });

  it('today returns YYYY-MM-DD', () => {
    const clock = new SystemClock();
    expect(clock.today()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('FixedClock', () => {
  const fixed = new Date('2025-06-15T12:00:00Z');

  it('now returns the fixed time', () => {
    const clock = new FixedClock(fixed);
    expect(clock.now().getTime()).toBe(fixed.getTime());
  });

  it('advance moves time forward', () => {
    const clock = new FixedClock(fixed);
    clock.advance(60_000); // 1 minute
    expect(clock.now().getTime()).toBe(fixed.getTime() + 60_000);
  });

  it('today derives from fixed time', () => {
    // Use noon UTC to avoid timezone-offset issues
    const clock = new FixedClock(new Date('2025-01-15T12:00:00Z'));
    expect(clock.today()).toBe('2025-01-15');
  });
});

describe('DueDate', () => {
  it('dueDateOf formats correctly', () => {
    expect(dueDateOf(new Date('2025-03-07T10:00:00Z'))).toBe('2025-03-07');
  });

  it('isOverdue returns true when past due', () => {
    expect(isOverdue('2025-01-01' as DueDate, '2025-01-02' as DueDate)).toBe(true);
  });

  it('isOverdue returns false when not past due', () => {
    expect(isOverdue('2025-01-02' as DueDate, '2025-01-01' as DueDate)).toBe(false);
  });

  it('isOverdue returns false on same day', () => {
    expect(isOverdue('2025-01-01' as DueDate, '2025-01-01' as DueDate)).toBe(false);
  });

  it('DueDateSchema validates correct format', () => {
    expect(DueDateSchema.safeParse('2025-06-15').success).toBe(true);
  });

  it('DueDateSchema rejects invalid format', () => {
    expect(DueDateSchema.safeParse('2025-13-01').success).toBe(false);
    expect(DueDateSchema.safeParse('not-a-date').success).toBe(false);
  });
});

describe('YearMonth', () => {
  it('yearMonthOf formats correctly', () => {
    expect(yearMonthOf(new Date('2025-03-07T10:00:00Z'))).toBe('2025-03');
  });

  it('YearMonthSchema validates', () => {
    expect(YearMonthSchema.safeParse('2025-06').success).toBe(true);
  });

  it('YearMonthSchema rejects invalid', () => {
    expect(YearMonthSchema.safeParse('2025-13').success).toBe(false);
    expect(YearMonthSchema.safeParse('2025').success).toBe(false);
  });
});
