import { format } from 'date-fns';

/**
 * Formats a Date for display. Called at the RSC layer — returns a plain string.
 */
export function formatDate(d: Date): string {
  return format(d, 'MMM d, yyyy');
}
