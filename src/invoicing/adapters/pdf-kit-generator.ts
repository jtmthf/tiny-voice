import PDFDocument from 'pdfkit';
import type { Result } from '@/shared/result/result';
import { ok, err } from '@/shared/result/result';
import type { PdfInput, PdfError, PdfGenerator } from '../ports/pdf-generator';
import { subtotal, taxAmount, total, outstandingBalance } from '../entities/invoice';
import { lineTotal } from '../entities/line-item';

function formatCents(cents: bigint): string {
  const sign = cents < 0n ? '-' : '';
  const absCents = cents < 0n ? -cents : cents;
  const dollars = absCents / 100n;
  const remainder = absCents % 100n;
  return `${sign}$${dollars}.${remainder.toString().padStart(2, '0')}`;
}

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
        const lt = lineTotal(item);
        const totalStr = lt.isOk() ? formatCents(lt.value.cents) : 'ERR';
        doc.text(
          `${item.description}  |  Qty: ${item.quantity}  |  Unit: ${formatCents(item.unitPrice.cents)}  |  Total: ${totalStr}`,
        );
      }

      doc.moveDown();
      doc.text(`Subtotal: ${formatCents(subtotal(invoice).cents)}`);
      doc.text(`Tax (${(invoice.taxRate * 100).toFixed(2)}%): ${formatCents(taxAmount(invoice).cents)}`);
      doc.font('Helvetica-Bold').text(`Total: ${formatCents(total(invoice).cents)}`);
      doc.font('Helvetica').text(`Outstanding: ${formatCents(outstandingBalance(invoice).cents)}`);

      doc.end();
    });
  }
}
