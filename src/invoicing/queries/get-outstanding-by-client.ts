import type { ClientId } from '@/shared/ids/client-id';
import type { Money as MoneyType } from '@/shared/money/money';
import { Money } from '@/shared/money/money';
import { outstandingBalance } from '../entities/invoice';
import type { InvoiceRepository } from '../ports/invoice-repository';

export interface GetOutstandingByClientDeps {
  readonly repo: InvoiceRepository;
}

export function getOutstandingByClient(
  deps: GetOutstandingByClientDeps,
  clientId: ClientId,
): MoneyType {
  const invoices = deps.repo.list({ clientId });
  let sum = Money.zero();
  for (const inv of invoices) {
    if (inv.status === 'sent') {
      sum = Money.add(sum, outstandingBalance(inv));
    }
  }
  return sum;
}
