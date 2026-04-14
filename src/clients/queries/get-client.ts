import type { ClientId } from '../../shared/ids/client-id';
import type { Client } from '../entities/client';
import type { ClientRepository } from '../ports/client-repository';

/**
 * Query: retrieve a single client by id.
 */
export function getClient(
  deps: { repo: ClientRepository },
  id: ClientId,
): Client | null {
  return deps.repo.findById(id);
}
