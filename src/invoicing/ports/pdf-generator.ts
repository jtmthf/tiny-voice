import type { Result } from 'neverthrow';
import type { Invoice } from '../entities/invoice';

export interface PdfInput {
  readonly invoice: Invoice;
  readonly clientName: string;
}

export interface PdfError { readonly kind: 'PdfGenerationFailed'; readonly reason: string }

export interface PdfGenerator {
  generate(input: PdfInput): Promise<Result<Uint8Array, PdfError>>;
}
