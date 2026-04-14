import type { LineItemId } from '@/shared/ids/line-item-id';
import type { Money } from '@/shared/money/money';
import { multiply } from '@/shared/money/money';
import type { Result } from '@/shared/result/result';
import type { MoneyError } from '@/shared/money/money';

export interface LineItem {
  readonly id: LineItemId;
  readonly description: string;
  readonly quantity: number; // integer >= 1
  readonly unitPrice: Money;
}

export function lineTotal(item: LineItem): Result<Money, MoneyError> {
  return multiply(item.unitPrice, item.quantity);
}
