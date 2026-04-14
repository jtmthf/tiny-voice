/**
 * Late fee daily rate: 0.05% per day (0.0005 as a decimal).
 *
 * Formula: fee = outstandingBalance * LateFeeRate * daysOverdue
 *
 * This is a simple daily rate. For a $1,000 invoice that is 30 days overdue:
 *   fee = $1,000 * 0.0005 * 30 = $15.00
 *
 * Roughly equivalent to 1.5% per month (0.0005 * 30 = 0.015).
 */
export const LateFeeRate = 0.0005;
