import type { Id } from './id';
import { newId, parseId, prefixedIdSchema } from './id';

export type LineItemId = Id<'li'>;

export const newLineItemId: () => LineItemId = newId('li');

export const parseLineItemId: (value: string) => LineItemId = (v) => parseId('li', v);

export const LineItemIdSchema = prefixedIdSchema('li');
