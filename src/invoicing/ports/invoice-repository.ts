import type { InvoiceId } from '@/shared/ids/invoice-id';
import type { ClientId } from '@/shared/ids/client-id';
import type { Result } from '@/shared/result/result';
import type { Invoice } from '../entities/invoice';
import type { InvoiceError } from '../errors/invoice-error';
import type { InvoiceStatus } from '../value-objects/invoice-status';

export interface InvoiceRepository {
  findById(id: InvoiceId): Invoice | null;
  save(invoice: Invoice): Result<void, InvoiceError>;
  list(filters?: { status?: InvoiceStatus; clientId?: ClientId }): readonly Invoice[];
}
