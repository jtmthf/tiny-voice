import type { LineItemId } from '@/shared/ids/line-item-id';
import type { Money as MoneyType } from '@/shared/money/money';
import { Money } from '@/shared/money/money';

export type LineItemKind = 'regular' | 'lateFee';

export interface LineItem {
  readonly id: LineItemId;
  readonly description: string;
  readonly quantity: number; // integer >= 1
  readonly unitPrice: MoneyType;
  readonly kind: LineItemKind;
}

/**
 * Computes the total for a line item. Infallible because `quantity` is
 * always a positive integer (enforced by Zod schema at the boundary).
 *
 * Accepts any object with `unitPrice` and `quantity` so query-layer
 * summary types (which omit `kind`) can use it too.
 */
export function lineTotal(item: Pick<LineItem, 'unitPrice' | 'quantity'>): MoneyType {
  return Money.multiplyByInt(item.unitPrice, item.quantity);
}
