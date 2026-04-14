import type { Id } from './id';
import { newId, parseId, prefixedIdSchema } from './id';

export type ClientId = Id<'client'>;

export const newClientId: () => ClientId = newId('client');

export const parseClientId: (value: string) => ClientId = (v) => parseId('client', v);

export const ClientIdSchema = prefixedIdSchema('client');
