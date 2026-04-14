import type { ClientId } from '../../shared/ids/client-id';
import type { Client } from '../entities/client';
import type { ClientRepository } from '../ports/client-repository';

/**
 * In-memory adapter for ClientRepository. Backed by a Map.
 * Useful for unit tests that don't need a real database.
 */
export class InMemoryClientRepo implements ClientRepository {
  private readonly clients: Map<ClientId, Client>;

  constructor(seed?: readonly Client[]) {
    this.clients = new Map((seed ?? []).map((c) => [c.id, c]));
  }

  findById(id: ClientId): Client | null {
    return this.clients.get(id) ?? null;
  }

  list(): readonly Client[] {
    return [...this.clients.values()].sort(
      (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
    );
  }

  save(client: Client): void {
    this.clients.set(client.id, client);
  }
}
