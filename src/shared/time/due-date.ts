import { z } from 'zod';
import { format, isBefore, parseISO, startOfDay } from 'date-fns';
import { defineValueObject } from '@/shared/domain/value-object';

const DUE_DATE_REGEX = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/;

/**
 * Branded string type for dates in "YYYY-MM-DD" format.
 */
export const DueDate = defineValueObject(
  'DueDate',
  z.string().regex(DUE_DATE_REGEX, 'Expected YYYY-MM-DD format'),
);

export type DueDate = z.infer<typeof DueDate.schema>;

export const DueDateSchema = DueDate.schema;

/**
 * Creates a DueDate from a Date object.
 */
export function dueDateOf(date: Date): DueDate {
  // date-fns' 'yyyy-MM-dd' output is well-formed by construction.
  return DueDate.trusted(format(date, 'yyyy-MM-dd'));
}

/**
 * Returns true if `due` is before `today`.
 */
export function isOverdue(due: DueDate, today: DueDate): boolean {
  const dueDay = startOfDay(parseISO(due));
  const todayDay = startOfDay(parseISO(today));
  return isBefore(dueDay, todayDay);
}
