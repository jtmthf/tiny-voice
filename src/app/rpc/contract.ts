import { z } from 'zod/v4';
import { os } from '@orpc/server';
import { rpcErrors } from './rpc-errors';
import type { RpcContext } from './rpc-context';
import { ClientIdSchema } from '@/shared/ids/client-id';
import { InvoiceIdSchema } from '@/shared/ids/invoice-id';

// ---------------------------------------------------------------------------
// DTO schemas (JSON-safe: Money → string dollars, Date → ISO string)
// ---------------------------------------------------------------------------

const MoneyDto = z.object({
  amount: z.string(), // e.g. "123.45"
  currency: z.literal('USD'),
});

const LineItemDto = z.object({
  id: z.string(),
  description: z.string(),
  quantity: z.number().int(),
  unitPrice: MoneyDto,
});

const PaymentDto = z.object({
  id: z.string(),
  amount: MoneyDto,
  recordedAt: z.iso.datetime(),
});

const ClientDto = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  createdAt: z.iso.datetime(),
});

const InvoiceDto = z.object({
  id: z.string(),
  clientId: z.string(),
  status: z.enum(['draft', 'sent', 'paid', 'void']),
  lineItems: z.array(LineItemDto),
  payments: z.array(PaymentDto),
  taxRate: z.number(),
  dueDate: z.string(),
  createdAt: z.iso.datetime(),
  version: z.number().int(),
});

export type { MoneyDto, ClientDto, InvoiceDto };
type MoneyDto = z.infer<typeof MoneyDto>;
type ClientDto = z.infer<typeof ClientDto>;
type InvoiceDto = z.infer<typeof InvoiceDto>;

// ---------------------------------------------------------------------------
// Shared base with context type + common errors
// ---------------------------------------------------------------------------

const base = os.$context<RpcContext>().errors(rpcErrors);

// ---------------------------------------------------------------------------
// Clients namespace
// ---------------------------------------------------------------------------

const clientsCreate = base
  .input(z.object({
    name: z.string().min(1),
    email: z.email(),
  }))
  .output(ClientDto);

// ---------------------------------------------------------------------------
// Invoicing namespace
// ---------------------------------------------------------------------------

const invoicingCreate = base
  .input(z.object({
    clientId: ClientIdSchema,
    taxRate: z.number().min(0).max(1),
    dueDate: z.string().regex(/^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/),
  }))
  .output(InvoiceDto);

const invoicingAddLineItem = base
  .input(z.object({
    invoiceId: InvoiceIdSchema,
    description: z.string().min(1),
    quantity: z.number().int().min(1),
    unitPriceCents: z.number().int().min(1),
  }))
  .output(InvoiceDto);

const invoicingSend = base
  .input(z.object({
    invoiceId: InvoiceIdSchema,
  }))
  .output(InvoiceDto);

const invoicingRecordPayment = base
  .input(z.object({
    invoiceId: InvoiceIdSchema,
    amountCents: z.number().int().min(1),
  }))
  .output(InvoiceDto);

const invoicingVoid = base
  .input(z.object({
    invoiceId: InvoiceIdSchema,
  }))
  .output(InvoiceDto);

const invoicingCalculateLateFee = base
  .input(z.object({
    invoiceId: InvoiceIdSchema,
  }))
  .output(InvoiceDto);

const invoicingGeneratePdf = base
  .input(z.object({
    invoiceId: InvoiceIdSchema,
  }))
  .output(z.object({
    size: z.number().int(),
    magic: z.string(),
  }));

// ---------------------------------------------------------------------------
// Exported contract shapes (used by router.ts to implement)
// ---------------------------------------------------------------------------

export const contract = {
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
} as const;
