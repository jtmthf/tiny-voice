// --- Entities ---
export type { Invoice } from './entities/invoice';
export {
  createInvoice,
  addLineItem,
  addLateFee,
  sendInvoice,
  recordPayment,
  voidInvoice,
  subtotal,
  taxAmount,
  total,
  paidAmount,
  outstandingBalance,
  isOverdue,
} from './entities/invoice';
export type { LineItem } from './entities/line-item';
export { lineTotal } from './entities/line-item';
export type { Payment } from './entities/payment';

// --- Value objects ---
export type { InvoiceStatus } from './value-objects/invoice-status';
export { InvoiceStatusSchema } from './value-objects/invoice-status';
export type { TaxRate } from './value-objects/tax-rate';
export { TaxRateSchema, calculateTax } from './value-objects/tax-rate';
export { LateFeeRate } from './value-objects/late-fee-rate';

// --- Errors ---
export type { InvoiceError } from './errors/invoice-error';
export { InvoiceError as InvoiceErrors } from './errors/invoice-error';

// --- Commands ---
export { createInvoice as createInvoiceCommand } from './commands/create-invoice';
export { CreateInvoiceInputSchema } from './commands/create-invoice';
export type { CreateInvoiceInput } from './commands/create-invoice';

export { addLineItem as addLineItemCommand } from './commands/add-line-item';
export { AddLineItemInputSchema } from './commands/add-line-item';
export type { AddLineItemInput } from './commands/add-line-item';

export { sendInvoice as sendInvoiceCommand } from './commands/send-invoice';
export { SendInvoiceInputSchema } from './commands/send-invoice';
export type { SendInvoiceInput } from './commands/send-invoice';

export { recordPayment as recordPaymentCommand } from './commands/record-payment';
export { RecordPaymentInputSchema } from './commands/record-payment';
export type { RecordPaymentInput } from './commands/record-payment';

export { voidInvoice as voidInvoiceCommand } from './commands/void-invoice';
export { VoidInvoiceInputSchema } from './commands/void-invoice';
export type { VoidInvoiceInput } from './commands/void-invoice';

export { calculateLateFee as calculateLateFeeCommand } from './commands/calculate-late-fee';
export { CalculateLateFeeInputSchema } from './commands/calculate-late-fee';
export type { CalculateLateFeeInput } from './commands/calculate-late-fee';
export { calculateLateFeeLineItem, daysOverdue } from './commands/calculate-late-fee';

// --- Queries ---
export { getInvoiceSummary } from './queries/get-invoice-summary';
export type { InvoiceSummary } from './queries/get-invoice-summary';
export { getInvoiceLineItems } from './queries/get-invoice-line-items';
export type { LineItemSummary } from './queries/get-invoice-line-items';
export { getInvoicePayments } from './queries/get-invoice-payments';
export type { PaymentSummary } from './queries/get-invoice-payments';
export { listInvoices } from './queries/list-invoices';
export { listInvoiceSummaries } from './queries/list-invoice-summaries';
export { getOutstandingByClient } from './queries/get-outstanding-by-client';

// --- Events ---
export type { InvoiceSent } from './events/invoice-sent';
export { InvoiceSentSchema } from './events/invoice-sent';
export type { InvoicePaymentRecorded } from './events/invoice-payment-recorded';
export { InvoicePaymentRecordedSchema } from './events/invoice-payment-recorded';
export type { InvoiceVoided } from './events/invoice-voided';
export { InvoiceVoidedSchema } from './events/invoice-voided';
export type { InvoicingEventMap } from './events/invoicing-event-map';

// --- Ports ---
export type { InvoiceRepository, InvoiceListItem } from './ports/invoice-repository';
export type { PdfGenerator, PdfInput, PdfError } from './ports/pdf-generator';
export type { NotificationSender, NotificationError, InvoiceSentNotification, PaymentReceivedNotification } from './ports/notification-sender';

// --- Adapters ---
export { SqliteInvoiceRepo } from './adapters/sqlite-invoice-repo';
export { InMemoryInvoiceRepo } from './adapters/in-memory-invoice-repo';
export { PdfKitGenerator } from './adapters/pdf-kit-generator';
export { StubPdfGenerator } from './adapters/stub-pdf-generator';
export { ConsoleNotificationSender } from './adapters/console-notification-sender';
export { CapturingNotificationSender } from './adapters/capturing-notification-sender';

// --- Testing ---
export { buildDraftInvoice, buildSentInvoice, buildPaidInvoice, buildLineItem, buildPayment } from './testing/invoice-factory';
