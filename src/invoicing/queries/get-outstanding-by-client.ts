import type { ClientId } from '@/shared/ids/client-id';
import type { Money } from '@/shared/money/money';
import { Money as MoneyFactory, add } from '@/shared/money/money';
import { outstandingBalance } from '../entities/invoice';
import type { InvoiceRepository } from '../ports/invoice-repository';

export interface GetOutstandingByClientDeps {
  readonly repo: InvoiceRepository;
}

export function getOutstandingByClient(
  deps: GetOutstandingByClientDeps,
  clientId: ClientId,
): Money {
  const invoices = deps.repo.list({ clientId });
  let sum = MoneyFactory.zero();
  for (const inv of invoices) {
    if (inv.status === 'sent') {
      sum = add(sum, outstandingBalance(inv));
    }
  }
  return sum;
}
