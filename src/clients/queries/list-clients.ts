import type { Client } from '../entities/client';
import type { ClientRepository } from '../ports/client-repository';

/**
 * Query: retrieve all clients, ordered by creation date.
 */
export function listClients(
  deps: { repo: ClientRepository },
): readonly Client[] {
  return deps.repo.list();
}
