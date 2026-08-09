# Invoice command dispatch handles only load → mutate → save

`applyInvoiceCommand` is the single dispatch interface for invoice mutations that follow the load → mutate → save shape (e.g. `sendInvoice`, `recordPayment`, `voidInvoice`, `addLateFee`). The dispatcher accepts a transition closure of type `InvoiceTransition = (invoice: Invoice) => Result<InvoiceOutcome, InvoiceError>` — the new aggregate state and the domain events to publish travel together on the `Outcome` envelope — and owns the transaction, outbox enqueue, and post-commit drain.

`createInvoice` (insert) and `deleteInvoice` (hard delete) deliberately sit **outside** the dispatcher. They have different shapes — insert assembles a new aggregate from scratch and emits no domain event; delete touches multiple tables and represents an administrative tear-down, not a state transition. Generalising the dispatcher to cover all three modes re-introduces the per-mode conditionals the consolidation was meant to remove, and dilutes the meaning of "command" away from "aggregate transition."

A future architectural review that flags "two mutations live outside `applyInvoiceCommand`" should not re-suggest pulling them in. The right response is to add a new helper (or leave them direct) — not to bend the dispatcher.
