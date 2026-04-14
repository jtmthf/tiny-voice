import type { InvoiceId } from '@/shared/ids/invoice-id';
import type { ClientId } from '@/shared/ids/client-id';
import type { Result } from '@/shared/result/result';
import { ok, err } from '@/shared/result/result';
import type { Invoice } from '../entities/invoice';
import type { InvoiceError } from '../errors/invoice-error';
import { InvoiceError as IE } from '../errors/invoice-error';
import type { InvoiceStatus } from '../value-objects/invoice-status';
import type { InvoiceRepository } from '../ports/invoice-repository';

function clone(invoice: Invoice): Invoice {
  return {
    ...invoice,
    lineItems: invoice.lineItems.map((li) => ({ ...li, unitPrice: { ...li.unitPrice } })),
    payments: invoice.payments.map((p) => ({ ...p, amount: { ...p.amount }, recordedAt: new Date(p.recordedAt.getTime()) })),
    createdAt: new Date(invoice.createdAt.getTime()),
  };
}

export class InMemoryInvoiceRepo implements InvoiceRepository {
  private readonly store = new Map<InvoiceId, Invoice>();

  findById(id: InvoiceId): Invoice | null {
    const inv = this.store.get(id);
    return inv ? clone(inv) : null;
  }

  save(invoice: Invoice): Result<void, InvoiceError> {
    const existing = this.store.get(invoice.id);
    if (existing) {
      // Optimistic concurrency: version must be exactly one more than stored
      if (existing.version !== invoice.version - 1) {
        return err(IE.concurrencyConflict());
      }
    }
    this.store.set(invoice.id, clone(invoice));
    return ok(undefined);
  }

  list(filters?: { status?: InvoiceStatus; clientId?: ClientId }): readonly Invoice[] {
    let results = [...this.store.values()];
    if (filters?.status) {
      results = results.filter((inv) => inv.status === filters.status);
    }
    if (filters?.clientId) {
      results = results.filter((inv) => inv.clientId === filters.clientId);
    }
    return results.map(clone);
  }
}
