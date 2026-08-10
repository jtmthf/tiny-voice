import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { getAppInstance } from '@/app/instance';
import { InvoiceIdSchema } from '@/shared/ids/invoice-id';

export const GeneratePdfInput = z.object({ invoiceId: InvoiceIdSchema });
export type GeneratePdfInput = z.infer<typeof GeneratePdfInput>;

export function parseGeneratePdfInput(data: unknown): GeneratePdfInput {
  const raw = data instanceof FormData ? Object.fromEntries(data.entries()) : data;
  return GeneratePdfInput.parse(raw);
}

export interface GeneratePdfResult {
  readonly filenameSuggestion: string;
  readonly bytesBase64: string;
  readonly contentType: 'application/pdf';
}

export async function generatePdfHandler(data: GeneratePdfInput): Promise<GeneratePdfResult> {
  const app = getAppInstance();
  const invoice = app.invoiceRepo.findById(data.invoiceId);
  if (!invoice) throw new Error('Invoice not found');

  const client = app.queries.clients.getClient(invoice.clientId);
  const clientName = client?.name ?? 'Unknown';

  const pdfResult = await app.pdfGenerator.generate({ invoice, clientName });
  if (pdfResult.isErr()) throw new Error(`PDF generation failed: ${pdfResult.error.reason}`);

  return {
    filenameSuggestion: `invoice-${invoice.id.slice(0, 8)}.pdf`,
    bytesBase64: Buffer.from(pdfResult.value).toString('base64'),
    contentType: 'application/pdf',
  };
}

export const generatePdfFn = createServerFn({ method: 'POST' })
  .validator(parseGeneratePdfInput)
  .handler(({ data }) => generatePdfHandler(data));
