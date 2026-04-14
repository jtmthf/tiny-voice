import { z } from 'zod/v4';
import { format } from 'date-fns';

/**
 * Branded string type for year-month in "YYYY-MM" format.
 */
export type YearMonth = string & { readonly __brand: 'YearMonth' };

const YEAR_MONTH_REGEX = /^\d{4}-(?:0[1-9]|1[0-2])$/;

export const YearMonthSchema = z.string().regex(YEAR_MONTH_REGEX, 'Expected YYYY-MM format').transform((val) => val as YearMonth);

/**
 * Creates a YearMonth from a Date.
 */
export function yearMonthOf(date: Date): YearMonth {
  return format(date, 'yyyy-MM') as YearMonth;
}

/**
 * Compares two YearMonth values lexicographically.
 * Returns -1, 0, or 1.
 */
export function compareYearMonth(a: YearMonth, b: YearMonth): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}
