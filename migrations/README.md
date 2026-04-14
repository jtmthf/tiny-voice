# Migrations

Migrations are append-only SQL files named `NNNN_description.sql` (e.g. `0001_create_clients.sql`). The runner in `scripts/migrate.ts` tracks each applied migration by filename and SHA-256 checksum in the `_migrations` table. Running the runner is idempotent: a second run is a no-op when all migrations are already applied.

Never edit an applied migration. If the runner detects that a file's checksum differs from the recorded value, it will fail with a clear error. To change schema, add a new migration file with the next sequence number.
