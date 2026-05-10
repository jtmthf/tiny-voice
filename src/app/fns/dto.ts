import type { Client } from '@/clients/entities/client';
import type { InvoiceSummary } from '@/invoicing/queries/get-invoice-summary';
import type { LineItemSummary } from '@/invoicing/queries/get-invoice-line-items';
import type { PaymentSummary } from '@/invoicing/queries/get-invoice-payments';
import type { MonthlyRevenue } from '@/reporting/ports/revenue-read-model';
import type { Money } from '@/shared/money/money';

export interface MoneyDto {
  readonly cents: string;
  readonly currency: 'USD';
}

export interface ClientDto {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly createdAt: string;
}

export interface InvoiceSummaryDto {
  readonly id: string;
  readonly clientId: string;
  readonly status: string;
  readonly lineItemCount: number;
  readonly subtotal: MoneyDto;
  readonly taxAmount: MoneyDto;
  readonly total: MoneyDto;
  readonly paidAmount: MoneyDto;
  readonly outstandingBalance: MoneyDto;
  readonly dueDate: string;
  readonly createdAt: string;
}

export interface LineItemDto {
  readonly id: string;
  readonly description: string;
  readonly quantity: number;
  readonly unitPrice: MoneyDto;
}

export interface PaymentDto {
  readonly id: string;
  readonly amount: MoneyDto;
  readonly recordedAt: string;
}

export interface RevenueDto {
  readonly month: string;
  readonly total: MoneyDto;
  readonly paymentCount: number;
  readonly updatedAt: string;
}

function moneyToDto(m: Money): MoneyDto {
  return { cents: m.cents.toString(), currency: 'USD' };
}

export function clientToDto(c: Client): ClientDto {
  return {
    id: c.id,
    name: c.name,
    email: String(c.email),
    createdAt: c.createdAt.toISOString(),
  };
}

export function invoiceSummaryToDto(inv: InvoiceSummary): InvoiceSummaryDto {
  return {
    id: inv.id,
    clientId: inv.clientId,
    status: inv.status,
    lineItemCount: inv.lineItemCount,
    subtotal: moneyToDto(inv.subtotal),
    taxAmount: moneyToDto(inv.taxAmount),
    total: moneyToDto(inv.total),
    paidAmount: moneyToDto(inv.paidAmount),
    outstandingBalance: moneyToDto(inv.outstandingBalance),
    dueDate: inv.dueDate,
    createdAt: inv.createdAt.toISOString(),
  };
}

export function lineItemToDto(li: LineItemSummary): LineItemDto {
  return {
    id: li.id,
    description: li.description,
    quantity: li.quantity,
    unitPrice: moneyToDto(li.unitPrice),
  };
}

export function paymentToDto(p: PaymentSummary): PaymentDto {
  return {
    id: p.id,
    amount: moneyToDto(p.amount),
    recordedAt: p.recordedAt.toISOString(),
  };
}

export function revenueToDto(r: MonthlyRevenue): RevenueDto {
  return {
    month: r.month,
    total: moneyToDto(r.total),
    paymentCount: r.paymentCount,
    updatedAt: r.updatedAt.toISOString(),
  };
}
