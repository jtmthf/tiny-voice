import type { InvoiceId } from '@/shared/ids/invoice-id';
import type { ClientId } from '@/shared/ids/client-id';
import type { DueDate } from '@/shared/time/due-date';
import type { Result } from '@/shared/result/result';
import type { Invoice } from '../entities/invoice';
import type { InvoiceError } from '../errors/invoice-error';
import type { InvoiceStatus } from '../value-objects/invoice-status';
import type { TaxRate } from '../value-objects/tax-rate';

/** Pre-aggregated row for list views. Avoids hydrating full aggregates. */
export interface InvoiceListItem {
  readonly id: InvoiceId;
  readonly clientId: ClientId;
  readonly status: InvoiceStatus;
  readonly taxRate: TaxRate;
  readonly dueDate: DueDate;
  readonly createdAt: Date;
  readonly lineItemCount: number;
  readonly subtotalCents: bigint;
  readonly paidAmountCents: bigint;
}

export interface InvoiceRepository {
  findById(id: InvoiceId): Invoice | null;
  save(invoice: Invoice): Result<void, InvoiceError>;
  list(filters?: { status?: InvoiceStatus; clientId?: ClientId }): readonly Invoice[];
  listSummaries(filters?: { status?: InvoiceStatus; clientId?: ClientId }): readonly InvoiceListItem[];
}
