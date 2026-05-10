import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod/v4';
import { getAppInstance } from '@/app/instance';
import { calculateLateFee } from '@/invoicing/commands/calculate-late-fee';
import { InvoiceIdSchema } from '@/shared/ids/invoice-id';
import { invoiceErrorMessage } from '@/app/lib/error-messages';
import { requireFeatureFlag } from './middleware/require-feature-flag';

export const CalculateLateFeeInput = z.object({ invoiceId: InvoiceIdSchema });
export type CalculateLateFeeInput = z.infer<typeof CalculateLateFeeInput>;

export function parseCalculateLateFeeInput(data: unknown): CalculateLateFeeInput {
  const raw = data instanceof FormData ? Object.fromEntries(data.entries()) : data;
  return CalculateLateFeeInput.parse(raw);
}

export async function calculateLateFeeHandler(data: CalculateLateFeeInput): Promise<{ error: string | null }> {
  const app = getAppInstance();
  const result = calculateLateFee(
    { repo: app.invoiceRepo, clock: app.clock },
    { invoiceId: data.invoiceId },
  );
  if (result.isErr()) return { error: invoiceErrorMessage(result.error) };
  return { error: null };
}

export const calculateLateFeeFn = createServerFn({ method: 'POST' })
  .middleware([requireFeatureFlag('lateFees')])
  .inputValidator(parseCalculateLateFeeInput)
  .handler(({ data }) => calculateLateFeeHandler(data));
