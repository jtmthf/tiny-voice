import { defineBrandedId } from '@/shared/domain/branded-id';

const ClientIdKit = defineBrandedId('client');

export type ClientId = ReturnType<typeof ClientIdKit.create>;

export const newClientId = ClientIdKit.create;

export const parseClientId = ClientIdKit.parse;

export const ClientIdSchema = ClientIdKit.schema;
