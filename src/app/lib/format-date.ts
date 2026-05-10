import { format } from 'date-fns';

/**
 * Formats a Date for display. Returns a plain string safe for client components.
 */
export function formatDate(d: Date): string {
  return format(d, 'MMM d, yyyy');
}
