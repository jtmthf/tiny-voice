import { newInvoiceId } from '@/shared/ids/invoice-id';
import { newLineItemId } from '@/shared/ids/line-item-id';
import { newPaymentId } from '@/shared/ids/payment-id';
import type { DueDate } from '@/shared/time/due-date';
import type { TaxRate } from '@/invoicing/index';
import type { Invoice } from '@/invoicing/index';
import type { Client } from '@/clients/index';
import type { Money } from '@/shared/money/money';
import {
  createClient,
} from '@/clients/index';
import {
  createInvoiceCommand,
  addLineItemCommand,
  sendInvoiceCommand,
  recordPaymentCommand,
  voidInvoiceCommand,
  calculateLateFeeCommand,
} from '@/invoicing/index';
import { contract } from './contract';
import { mapInvoiceError, mapClientError } from './rpc-errors';

// ---------------------------------------------------------------------------
// DTO conversion helpers
// ---------------------------------------------------------------------------

function centsToDollars(cents: bigint): string {
  const sign = cents < 0n ? '-' : '';
  const abs = cents < 0n ? -cents : cents;
  const whole = abs / 100n;
  const frac = abs % 100n;
  return `${sign}${whole}.${frac.toString().padStart(2, '0')}`;
}

function moneyToDto(m: Money) {
  return { amount: centsToDollars(m.cents), currency: m.currency };
}

function clientToDto(c: Client) {
  return {
    id: c.id,
    name: c.name,
    email: String(c.email),
    createdAt: c.createdAt.toISOString(),
  };
}

function invoiceToDto(inv: Invoice) {
  return {
    id: inv.id,
    clientId: inv.clientId,
    status: inv.status,
    lineItems: inv.lineItems.map((li) => ({
      id: li.id,
      description: li.description,
      quantity: li.quantity,
      unitPrice: moneyToDto(li.unitPrice),
    })),
    payments: inv.payments.map((p) => ({
      id: p.id,
      amount: moneyToDto(p.amount),
      recordedAt: p.recordedAt.toISOString(),
    })),
    taxRate: inv.taxRate,
    dueDate: inv.dueDate,
    createdAt: inv.createdAt.toISOString(),
    version: inv.version,
  };
}

// ---------------------------------------------------------------------------
// Router implementation — each procedure uses .handler() on the contract shape
// ---------------------------------------------------------------------------

const clientsCreate = contract.clients.create
  .handler(async ({ input, context, errors }) => {
    const result = createClient(
      { repo: context.clientRepo, clock: context.clock, logger: context.logger },
      { name: input.name, email: input.email },
    );

    if (result.isErr()) {
      mapClientError(result.error, errors);
    }

    return clientToDto(result.value);
  });

const invoicingCreate = contract.invoicing.create
  .handler(async ({ input, context, errors }) => {
    // Boundary validation: verify client exists
    const client = context.clientRepo.findById(input.clientId);
    if (!client) {
      throw errors.CLIENT_NOT_FOUND();
    }

    const result = createInvoiceCommand(
      { repo: context.invoiceRepo, clock: context.clock },
      {
        id: newInvoiceId(),
        clientId: input.clientId,
        taxRate: input.taxRate as TaxRate,
        dueDate: input.dueDate as DueDate,
      },
    );

    if (result.isErr()) {
      mapInvoiceError(result.error, errors);
    }

    return invoiceToDto(result.value);
  });

const invoicingAddLineItem = contract.invoicing.addLineItem
  .handler(async ({ input, context, errors }) => {
    const result = addLineItemCommand(
      { repo: context.invoiceRepo },
      {
        invoiceId: input.invoiceId,
        lineItemId: newLineItemId(),
        description: input.description,
        quantity: input.quantity,
        unitPriceCents: BigInt(input.unitPriceCents),
      },
    );

    if (result.isErr()) {
      mapInvoiceError(result.error, errors);
    }

    return invoiceToDto(result.value);
  });

const invoicingSend = contract.invoicing.send
  .handler(async ({ input, context, errors }) => {
    const result = await sendInvoiceCommand(
      { db: context.db, repo: context.invoiceRepo, outbox: context.outbox, clock: context.clock, eventBus: context.eventBus },
      { invoiceId: input.invoiceId },
    );

    if (result.isErr()) {
      mapInvoiceError(result.error, errors);
    }

    return invoiceToDto(result.value);
  });

const invoicingRecordPayment = contract.invoicing.recordPayment
  .handler(async ({ input, context, errors }) => {
    const result = await recordPaymentCommand(
      { db: context.db, repo: context.invoiceRepo, outbox: context.outbox, clock: context.clock, eventBus: context.eventBus },
      {
        invoiceId: input.invoiceId,
        paymentId: newPaymentId(),
        amountCents: BigInt(input.amountCents),
      },
    );

    if (result.isErr()) {
      mapInvoiceError(result.error, errors);
    }

    return invoiceToDto(result.value);
  });

const invoicingVoid = contract.invoicing.void
  .handler(async ({ input, context, errors }) => {
    const result = await voidInvoiceCommand(
      { db: context.db, repo: context.invoiceRepo, outbox: context.outbox, clock: context.clock, eventBus: context.eventBus },
      { invoiceId: input.invoiceId },
    );

    if (result.isErr()) {
      mapInvoiceError(result.error, errors);
    }

    return invoiceToDto(result.value);
  });

const invoicingCalculateLateFee = contract.invoicing.calculateLateFee
  .handler(async ({ input, context, errors }) => {
    if (!context.featureFlags.isEnabled('lateFees')) {
      throw errors.FEATURE_DISABLED();
    }

    const result = calculateLateFeeCommand(
      { repo: context.invoiceRepo, clock: context.clock },
      { invoiceId: input.invoiceId },
    );

    if (result.isErr()) {
      mapInvoiceError(result.error, errors);
    }

    return invoiceToDto(result.value);
  });

const invoicingGeneratePdf = contract.invoicing.generatePdf
  .handler(async ({ input, context, errors }) => {
    const invoice = context.invoiceRepo.findById(
      input.invoiceId,
    );
    if (!invoice) {
      throw errors.INVOICE_NOT_FOUND();
    }

    const client = context.clientRepo.findById(invoice.clientId);
    const clientName = client?.name ?? 'Unknown';

    const pdfResult = await context.pdfGenerator.generate({ invoice, clientName });
    if (pdfResult.isErr()) {
      throw errors.PDF_GENERATION_FAILED({ data: { reason: pdfResult.error.reason } });
    }

    const bytes = pdfResult.value;
    // Return size and first 4 bytes as hex "magic" to prove generation worked
    const magic = Array.from(bytes.slice(0, 4))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');

    return { size: bytes.length, magic };
  });

// ---------------------------------------------------------------------------
// Assembled router
// ---------------------------------------------------------------------------

export const router = {
  clients: {
    create: clientsCreate,
  },
  invoicing: {
    create: invoicingCreate,
    addLineItem: invoicingAddLineItem,
    send: invoicingSend,
    recordPayment: invoicingRecordPayment,
    void: invoicingVoid,
    calculateLateFee: invoicingCalculateLateFee,
    generatePdf: invoicingGeneratePdf,
  },
};

// ---------------------------------------------------------------------------
// Server Actions — each procedure gets .actionable() for Next.js consumption
//
// Cache invalidation is co-located here via inline onSuccess interceptors
// that call `updateTag` after a successful mutation. Read-only procedures
// (generatePdf) omit the interceptor.
// ---------------------------------------------------------------------------

import { updateTag } from 'next/cache';

async function actionContext() {
  const { getRpcContext } = await import('./get-rpc-context');
  return getRpcContext();
}

function withCacheInvalidation(...tags: string[]) {
  return async function <T>(options: { next(): Promise<T> }): Promise<T> {
    const result = await options.next();
    for (const tag of tags) updateTag(tag);
    return result;
  };
}

export const actions = {
  clients: {
    create: clientsCreate.actionable({
      context: actionContext,
      interceptors: [withCacheInvalidation('clients')],
    }),
  },
  invoicing: {
    create: invoicingCreate.actionable({
      context: actionContext,
      interceptors: [withCacheInvalidation('invoices')],
    }),
    addLineItem: invoicingAddLineItem.actionable({
      context: actionContext,
      interceptors: [withCacheInvalidation('invoices')],
    }),
    send: invoicingSend.actionable({
      context: actionContext,
      interceptors: [withCacheInvalidation('invoices')],
    }),
    recordPayment: invoicingRecordPayment.actionable({
      context: actionContext,
      interceptors: [withCacheInvalidation('invoices', 'revenue')],
    }),
    void: invoicingVoid.actionable({
      context: actionContext,
      interceptors: [withCacheInvalidation('invoices')],
    }),
    calculateLateFee: invoicingCalculateLateFee.actionable({
      context: actionContext,
      interceptors: [withCacheInvalidation('invoices')],
    }),
    generatePdf: invoicingGeneratePdf.actionable({
      context: actionContext,
    }),
  },
};
