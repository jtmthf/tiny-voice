import type { ClientId } from '@/shared/ids/client-id';
import type { Money as MoneyType } from '@/shared/money/money';
import { Money } from '@/shared/money/money';
import { calculateTax } from '../value-objects/tax-rate';
import type { InvoiceRepository } from '../ports/invoice-repository';

export interface GetOutstandingByClientDeps {
  readonly repo: InvoiceRepository;
}

export function getOutstandingByClient(
  deps: GetOutstandingByClientDeps,
  clientId: ClientId,
): MoneyType {
  const items = deps.repo.listSummaries({ clientId });
  let sum = Money.zero();
  for (const item of items) {
    if (item.status !== 'sent') continue;
    const sub = Money.fromCents(item.subtotalCents);
    const tax = calculateTax(sub, item.taxRate);
    const tot = Money.add(sub, tax);
    const outstanding = Money.subtract(tot, Money.fromCents(item.paidAmountCents));
    sum = Money.add(sum, outstanding);
  }
  return sum;
}
