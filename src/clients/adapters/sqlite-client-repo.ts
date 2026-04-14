import type { Database } from '../../shared/db/database';
import type { ClientId } from '../../shared/ids/client-id';
import type { Client } from '../entities/client';
import type { ClientRepository } from '../ports/client-repository';
import { fromDb, toDb } from '../../shared/ids/id';
import { EmailAddressSchema } from '../value-objects/email-address';

interface ClientRow {
  id: string;
  name: string;
  email: string;
  created_at: string;
}

function rowToClient(row: ClientRow): Client {
  const email = EmailAddressSchema.parse(row.email);
  return {
    id: fromDb('client', row.id),
    name: row.name,
    email,
    createdAt: new Date(row.created_at),
  };
}

/**
 * SQLite adapter for ClientRepository.
 */
export class SqliteClientRepo implements ClientRepository {
  constructor(private readonly db: Database) {}

  findById(id: ClientId): Client | null {
    const row = this.db
      .prepare<ClientRow>('SELECT id, name, email, created_at FROM clients WHERE id = ?')
      .get(toDb(id));
    return row ? rowToClient(row) : null;
  }

  list(): readonly Client[] {
    const rows = this.db
      .prepare<ClientRow>('SELECT id, name, email, created_at FROM clients ORDER BY created_at ASC')
      .all();
    return rows.map(rowToClient);
  }

  save(client: Client): void {
    this.db
      .prepare(
        `INSERT INTO clients (id, name, email, created_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           name = excluded.name,
           email = excluded.email,
           created_at = excluded.created_at`,
      )
      .run(toDb(client.id), client.name, client.email, client.createdAt.toISOString());
  }
}
