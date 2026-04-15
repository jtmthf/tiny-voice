import PDFDocument from 'pdfkit';
import type { Result } from 'neverthrow';
import { ok, err } from 'neverthrow';
import { Money } from '@/shared/money/money';
import type { PdfInput, PdfError, PdfGenerator } from '../ports/pdf-generator';
import { subtotal, taxAmount, total, outstandingBalance } from '../entities/invoice';
import { lineTotal } from '../entities/line-item';

export class PdfKitGenerator implements PdfGenerator {
  async generate(input: PdfInput): Promise<Result<Uint8Array, PdfError>> {
    try {
      return ok(await this.buildPdf(input));
    } catch (e) {
      const reason = e instanceof Error ? e.message : String(e);
      return err({ kind: 'PdfGenerationFailed', reason });
    }
  }

  private buildPdf(input: PdfInput): Promise<Uint8Array> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 50 });
      const chunks: Buffer[] = [];

      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(new Uint8Array(Buffer.concat(chunks))));
      doc.on('error', reject);

      const { invoice, clientName } = input;

      // Header
      doc.fontSize(20).text('INVOICE', { align: 'center' });
      doc.moveDown();
      doc.fontSize(12).text(`Invoice #: ${invoice.id}`);
      doc.text(`Client: ${clientName}`);
      doc.text(`Date: ${invoice.createdAt.toISOString().split('T')[0]}`);
      doc.text(`Due: ${invoice.dueDate}`);
      doc.text(`Status: ${invoice.status}`);
      doc.moveDown();

      // Line items header
      doc.font('Helvetica-Bold');
      doc.text('Description', 50, doc.y, { width: 200, continued: false });

      // Line items
      doc.font('Helvetica');
      for (const item of invoice.lineItems) {
        const totalStr = Money.toDisplayString(lineTotal(item));
        doc.text(
          `${item.description}  |  Qty: ${item.quantity}  |  Unit: ${Money.toDisplayString(item.unitPrice)}  |  Total: ${totalStr}`,
        );
      }

      doc.moveDown();
      doc.text(`Subtotal: ${Money.toDisplayString(subtotal(invoice))}`);
      doc.text(`Tax (${(invoice.taxRate * 100).toFixed(2)}%): ${Money.toDisplayString(taxAmount(invoice))}`);
      doc.font('Helvetica-Bold').text(`Total: ${Money.toDisplayString(total(invoice))}`);
      doc.font('Helvetica').text(`Outstanding: ${Money.toDisplayString(outstandingBalance(invoice))}`);

      doc.end();
    });
  }
}
