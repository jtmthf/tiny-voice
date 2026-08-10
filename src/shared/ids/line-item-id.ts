import { defineBrandedId } from '@/shared/domain/branded-id';

const LineItemIdKit = defineBrandedId('li');

export type LineItemId = ReturnType<typeof LineItemIdKit.create>;

export const newLineItemId = LineItemIdKit.create;

export const parseLineItemId = LineItemIdKit.parse;

export const LineItemIdSchema = LineItemIdKit.schema;
