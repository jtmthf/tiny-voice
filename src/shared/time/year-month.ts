import { z } from 'zod';
import { format } from 'date-fns';
import { defineValueObject } from '@/shared/domain/value-object';

const YEAR_MONTH_REGEX = /^\d{4}-(?:0[1-9]|1[0-2])$/;

/**
 * Branded string type for year-month in "YYYY-MM" format.
 */
export const YearMonth = defineValueObject(
  'YearMonth',
  z.string().regex(YEAR_MONTH_REGEX, 'Expected YYYY-MM format'),
);

export type YearMonth = z.infer<typeof YearMonth.schema>;

export const YearMonthSchema = YearMonth.schema;

/**
 * Creates a YearMonth from a Date.
 */
export function yearMonthOf(date: Date): YearMonth {
  // date-fns' 'yyyy-MM' output is well-formed by construction.
  return YearMonth.trusted(format(date, 'yyyy-MM'));
}
