import { z } from 'zod/v4';
import { format, isBefore, parseISO, startOfDay } from 'date-fns';

/**
 * Branded string type for dates in "YYYY-MM-DD" format.
 */
export type DueDate = string & { readonly __brand: 'DueDate' };

const DUE_DATE_REGEX = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/;

export const DueDateSchema = z.string().regex(DUE_DATE_REGEX, 'Expected YYYY-MM-DD format').transform((val) => val as DueDate);

/**
 * Creates a DueDate from a Date object.
 */
export function dueDateOf(date: Date): DueDate {
  return format(date, 'yyyy-MM-dd') as DueDate;
}

/**
 * Returns true if `due` is before `today`.
 */
export function isOverdue(due: DueDate, today: DueDate): boolean {
  const dueDay = startOfDay(parseISO(due));
  const todayDay = startOfDay(parseISO(today));
  return isBefore(dueDay, todayDay);
}
