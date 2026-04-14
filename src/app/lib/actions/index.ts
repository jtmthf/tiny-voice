'use server';

/**
 * Server Action wrappers for the oRPC procedures.
 *
 * Client components import from here instead of directly from `@/app/rpc/router.js`.
 * The `'use server'` directive at file level ensures Next.js creates a server
 * reference boundary — the bundler does NOT trace into the router's server-only
 * dependencies (pdfkit, better-sqlite3, etc.) for the client bundle.
 *
 * Cache invalidation is handled by `onSuccess` interceptors on each
 * `.actionable()` call in `router.ts`. Tags are declared once, co-located
 * with the procedure — nothing to remember here.
 */

import { redirect } from 'next/navigation';
import { actions as rpcActions } from '@/app/rpc/router';

// ---------------------------------------------------------------------------
// FormData-accepting actions (for useActionState + progressive enhancement)
// ---------------------------------------------------------------------------

export interface FormState { error: string | null }

export async function createClientForm(prev: FormState, formData: FormData): Promise<FormState> {
  const name = formData.get('name') as string;
  const email = formData.get('email') as string;
  const [err, data] = await rpcActions.clients.create({ name, email });
  if (err) return { error: err.message };
  redirect(`/clients/${data.id}`);
}

// ---------------------------------------------------------------------------
// Object-accepting actions (for programmatic / JS-required forms)
// ---------------------------------------------------------------------------

export async function createClient(input: { name: string; email: string }) {
  return rpcActions.clients.create(input);
}

export async function createInvoice(input: { clientId: string; taxRate: number; dueDate: string }) {
  return rpcActions.invoicing.create(input);
}

export async function addLineItem(input: { invoiceId: string; description: string; quantity: number; unitPriceCents: number }) {
  return rpcActions.invoicing.addLineItem(input);
}

export async function sendInvoice(input: { invoiceId: string }) {
  return rpcActions.invoicing.send(input);
}

export async function recordPayment(input: { invoiceId: string; amountCents: number }) {
  return rpcActions.invoicing.recordPayment(input);
}

export async function voidInvoice(input: { invoiceId: string }) {
  return rpcActions.invoicing.void(input);
}

export async function calculateLateFee(input: { invoiceId: string }) {
  return rpcActions.invoicing.calculateLateFee(input);
}

export async function generatePdf(input: { invoiceId: string }) {
  return rpcActions.invoicing.generatePdf(input);
}
