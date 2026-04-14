import type { ClientId } from '../../shared/ids/client-id';
import type { Client } from '../entities/client';

/**
 * Port interface for client persistence.
 */
export interface ClientRepository {
  findById(id: ClientId): Client | null;
  list(): readonly Client[];
  save(client: Client): void;
}
