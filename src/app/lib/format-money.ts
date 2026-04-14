import type { Money } from '@/shared/money/money';

/**
 * Formats a Money value for display: "$123.45".
 * Handles negative values: "-$12.00".
 * Called at the RSC layer — returns a plain string safe for client components.
 */
export function formatMoney(m: Money): string {
  const sign = m.cents < 0n ? '-' : '';
  const abs = m.cents < 0n ? -m.cents : m.cents;
  const whole = abs / 100n;
  const frac = abs % 100n;
  return `${sign}$${whole}.${frac.toString().padStart(2, '0')}`;
}
