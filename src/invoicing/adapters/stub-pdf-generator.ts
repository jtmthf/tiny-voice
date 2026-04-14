import type { Result } from '@/shared/result/result';
import { ok } from '@/shared/result/result';
import type { PdfInput, PdfError, PdfGenerator } from '../ports/pdf-generator';

/**
 * Returns a minimal valid PDF with deterministic output.
 * Same input always produces the same bytes.
 */
export class StubPdfGenerator implements PdfGenerator {
  async generate(input: PdfInput): Promise<Result<Uint8Array, PdfError>> {
    const invoiceId = input.invoice.id;
    // Build a minimal valid PDF with the invoice ID embedded as text.
    const content = `Invoice #${invoiceId}`;
    const streamContent = `BT /F1 12 Tf 100 700 Td (${content}) Tj ET`;
    const streamLength = streamContent.length;

    const pdf = [
      '%PDF-1.4',
      '1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj',
      '2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj',
      `3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj`,
      `4 0 obj<</Length ${streamLength}>>stream\n${streamContent}\nendstream endobj`,
      '5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj',
      'xref',
      '0 6',
      '0000000000 65535 f ',
      'trailer<</Size 6/Root 1 0 R>>',
      '%%EOF',
    ].join('\n');

    return ok(new TextEncoder().encode(pdf));
  }
}
