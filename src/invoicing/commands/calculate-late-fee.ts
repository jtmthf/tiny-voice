import { z } from 'zod/v4';
import { InvoiceIdSchema } from '@/shared/ids/invoice-id';
import { newLineItemId } from '@/shared/ids/line-item-id';
import type { Clock } from '@/shared/time/clock';
import { isOverdue as isDueDateOverdue } from '@/shared/time/due-date';
import type { DueDate } from '@/shared/time/due-date';
import { bankersRound } from '@/shared/money/bankers-round';
import { Money } from '@/shared/money/money';
import type { Result } from 'neverthrow';
import { err } from 'neverthrow';
import type { Invoice } from '../entities/invoice';
import { outstandingBalance, addLateFee as addLateFeePure } from '../entities/invoice';
import type { InvoiceError } from '../errors/invoice-error';
import { InvoiceError as IE } from '../errors/invoice-error';
import type { InvoiceRepository } from '../ports/invoice-repository';
import type { LineItem } from '../entities/line-item';
import { LateFeeRate } from '../value-objects/late-fee-rate';

export const CalculateLateFeeInputSchema = z.object({
  invoiceId: InvoiceIdSchema,
});

export type CalculateLateFeeInput = z.infer<typeof CalculateLateFeeInputSchema>;

export interface CalculateLateFeeDeps {
  readonly repo: InvoiceRepository;
  readonly clock: Clock;
}

/**
 * Computes the number of days between two YYYY-MM-DD date strings.
 * Returns a positive integer when `today` is after `dueDate`.
 */
export function daysOverdue(dueDate: DueDate, today: DueDate): number {
  const due = new Date(dueDate + 'T00:00:00Z');
  const now = new Date(today + 'T00:00:00Z');
  const diffMs = now.getTime() - due.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

/**
 * Pure function: calculates a late-fee line item for an overdue invoice.
 *
 * Formula: fee = outstandingBalance * LateFeeRate * daysOverdue
 * Uses banker's rounding for the final cent amount.
 */
export function calculateLateFeeLineItem(
  outstanding: Money,
  days: number,
): LineItem {
  // Scale rate to avoid float precision: rate * 1_000_000, then divide
  const SCALE = 1_000_000n;
  const scaledRate = BigInt(Math.round(LateFeeRate * 1_000_000));
  const rawCents = outstanding.cents * scaledRate * BigInt(days);
  const feeCents = bankersRound(rawCents, SCALE);

  return {
    id: newLineItemId(),
    description: `Late fee (${days} days overdue)`,
    quantity: 1,
    unitPrice: Money.fromCents(feeCents),
  };
}

export function calculateLateFee(
  deps: CalculateLateFeeDeps,
  input: CalculateLateFeeInput,
): Result<Invoice, InvoiceError> {
  const invoice = deps.repo.findById(input.invoiceId);
  if (!invoice) return err(IE.invalidInput(`Invoice ${input.invoiceId} not found`));

  const today = deps.clock.today();

  // Check sent + overdue (addLateFee checks status, but we need to check overdue ourselves)
  if (invoice.status !== 'sent') {
    return err(IE.invalidTransition(invoice.status, 'sent'));
  }

  if (!isDueDateOverdue(invoice.dueDate, today)) {
    return err(IE.notOverdue());
  }

  const days = daysOverdue(invoice.dueDate, today);
  const outstanding = outstandingBalance(invoice);
  const lateFeeItem = calculateLateFeeLineItem(outstanding, days);

  const result = addLateFeePure(invoice, lateFeeItem);
  if (result.isErr()) return result;

  const updated = result.value;
  const saveResult = deps.repo.save(updated);
  if (saveResult.isErr()) return err(saveResult.error);

  return result;
}
