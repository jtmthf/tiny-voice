import type { Id } from './id';
import { newId, parseId, prefixedIdSchema } from './id';

export type PaymentId = Id<'pay'>;

export const newPaymentId: () => PaymentId = newId('pay');

export const parsePaymentId: (value: string) => PaymentId = (v) => parseId('pay', v);

export const PaymentIdSchema = prefixedIdSchema('pay');
