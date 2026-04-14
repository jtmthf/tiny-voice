# Domain terms

Ubiquitous language for tiny-voice. Each term maps to code in `src/`.

| Term | Definition | Code reference |
|---|---|---|
| **Invoice** | Aggregate root in the invoicing module. Immutable data type with state machine transitions as pure functions (`createInvoice`, `addLineItem`, `sendInvoice`, `recordPayment`, `voidInvoice`). Carries line items, payments, tax rate, due date, and a version for optimistic concurrency. | `src/invoicing/entities/invoice.ts` |
| **Line Item** | Entity within the Invoice aggregate. Has description, quantity (integer >= 1), and unit price (`Money`). `lineTotal` = quantity * unitPrice. | `src/invoicing/entities/line-item.ts` |
| **Payment** | Entity within the Invoice aggregate. An amount (`Money`) recorded against an outstanding invoice, with a timestamp. | `src/invoicing/entities/payment.ts` |
| **Client** | Entity in the clients module. Has name (1-200 chars) and email (`EmailAddress` branded type). Created via `makeClient`. | `src/clients/entities/client.ts` |
| **Draft** | Initial invoice status. Allows adding line items. The only status from which `sendInvoice` is valid. | `InvoiceStatus = 'draft'` |
| **Sent** | Invoice has been sent to the client. Allows recording payments. Transitions to Paid when outstanding balance reaches zero. | `InvoiceStatus = 'sent'` |
| **Paid** | All payments received; outstanding balance is zero. Terminal -- no further mutations except that `voidInvoice` returns `AlreadyPaid` error (voiding a paid invoice is not allowed). | `InvoiceStatus = 'paid'` |
| **Void** | Cancelled invoice. No further mutations; all operations return `InvoiceVoided` error. Reachable from Draft or Sent. | `InvoiceStatus = 'void'` |
| **Due Date** | Branded `string` in YYYY-MM-DD format (`DueDate`). Calendar date by which payment is expected. | `src/shared/time/due-date.ts` |
| **Overdue** | An invoice is overdue when its status is `sent` and today > dueDate. Checked by `isOverdue(invoice, today)`. | `invoice.ts#isOverdue` |
| **Subtotal** | Sum of all line item totals (quantity * unitPrice). Computed by `subtotal(invoice)`. | `invoice.ts#subtotal` |
| **Tax Amount** | Subtotal * tax rate, computed with banker's rounding via `calculateTax`. | `invoice.ts#taxAmount` |
| **Total** | Subtotal + tax amount. Computed by `total(invoice)`. This is the gross total. | `invoice.ts#total` |
| **Outstanding Balance** | `total(invoice) - paidAmount(invoice)`. Computed by `outstandingBalance(invoice)`. When zero, invoice transitions to Paid. | `invoice.ts#outstandingBalance` |
| **Tax Rate** | Branded `number` in [0, 1] range (e.g., 0.075 for 7.5%). Validated by `TaxRateSchema`. | `src/invoicing/value-objects/tax-rate.ts` |
| **Late Fee** | A line item added to an overdue `sent` invoice via `addLateFee`. Calculated as `outstandingBalance * 0.05% daily rate * daysOverdue`, using banker's rounding. Gated by the `lateFees` feature flag at the RPC boundary. Detectable by the description prefix `"Late fee"`. Only one late fee may be applied per invoice. | `src/invoicing/commands/calculate-late-fee.ts`, `src/invoicing/entities/invoice.ts#addLateFee` |
