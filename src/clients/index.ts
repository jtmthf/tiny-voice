// Clients module — curated public API.

// Entities
export type { Client } from './entities/client';
export type { ClientValidationError } from './entities/client';

// Value objects
export type { EmailAddress } from './value-objects/email-address';
export { EmailAddressSchema } from './value-objects/email-address';
export type { EmailError } from './value-objects/email-address';

// Ports
export type { ClientRepository } from './ports/client-repository';

// Adapters
export { SqliteClientRepo } from './adapters/sqlite-client-repo';
export { InMemoryClientRepo } from './adapters/in-memory-client-repo';

// Commands
export { CreateClientInputSchema, createClient } from './commands/create-client';
export type { CreateClientInput, CreateClientError } from './commands/create-client';

// Queries
export { getClient } from './queries/get-client';
export { listClients } from './queries/list-clients';

// Testing
export { testClient } from './testing/client-factory';
