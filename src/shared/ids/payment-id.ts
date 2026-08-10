import { defineBrandedId } from '@/shared/domain/branded-id';

const PaymentIdKit = defineBrandedId('pay');

export type PaymentId = ReturnType<typeof PaymentIdKit.create>;

export const newPaymentId = PaymentIdKit.create;

export const parsePaymentId = PaymentIdKit.parse;

export const PaymentIdSchema = PaymentIdKit.schema;
