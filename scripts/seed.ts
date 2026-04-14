import { resolve } from 'node:path';
import { faker } from '@faker-js/faker';
import { EnvConfig } from '../src/shared/config/env-config.js';
import { ConsoleLogger } from '../src/shared/logger/console-logger.js';
import { SqliteDatabase } from '../src/shared/db/sqlite-database.js';
import { runMigrations } from '../src/shared/db/run-migrations.js';

// ---------------------------------------------------------------------------
// Reproducible seed -- same data every run
// ---------------------------------------------------------------------------
faker.seed(42);

// ---------------------------------------------------------------------------
// Deterministic UUID v7-like IDs (faker's uuid isn't v7-shaped, so we mint our own)
// ---------------------------------------------------------------------------
let idCounter = 0;
function seededId(): string {
  idCounter++;
  const ts = 1735689600000 + idCounter * 60000;
  const hex = ts.toString(16).padStart(12, '0');
  const r1 = faker.number.int({ min: 0, max: 0xfff }).toString(16).padStart(3, '0');
  const r2 = faker.number.int({ min: 0, max: 0x3fff });
  const r3 = faker.number.int({ min: 0, max: 0xffffffffffff })
    .toString(16)
    .padStart(12, '0');
  return `${hex.slice(0, 8)}-${hex.slice(8)}-7${r1}-${(0x8000 | r2).toString(16)}-${r3}`;
}

// ---------------------------------------------------------------------------
// Domain-specific generators
// ---------------------------------------------------------------------------

const SERVICE_CATALOG = [
  { description: 'Website redesign - homepage', minPrice: 2000, maxPrice: 8000 },
  { description: 'Website redesign - inner pages', minPrice: 1500, maxPrice: 5000 },
  { description: 'Monthly SEO retainer', minPrice: 500, maxPrice: 3000 },
  { description: 'Logo design and brand guidelines', minPrice: 2500, maxPrice: 12000 },
  { description: 'Content writing - blog posts (5)', minPrice: 250, maxPrice: 1500 },
  { description: 'Social media management - monthly', minPrice: 800, maxPrice: 3000 },
  { description: 'Email campaign setup', minPrice: 300, maxPrice: 2000 },
  { description: 'Photography - product shots', minPrice: 500, maxPrice: 4000 },
  { description: 'Video production - 60s spot', minPrice: 3000, maxPrice: 15000 },
  { description: 'UX audit and recommendations', minPrice: 2000, maxPrice: 10000 },
  { description: 'API integration development', minPrice: 3000, maxPrice: 20000 },
  { description: 'Database optimization', minPrice: 1500, maxPrice: 8000 },
  { description: 'Cloud infrastructure setup', minPrice: 2000, maxPrice: 12000 },
  { description: 'Security audit and penetration test', minPrice: 5000, maxPrice: 25000 },
  { description: 'Technical documentation', minPrice: 1000, maxPrice: 5000 },
  { description: 'Staff training workshop (half day)', minPrice: 1500, maxPrice: 4000 },
  { description: 'Staff training workshop (full day)', minPrice: 2500, maxPrice: 7000 },
  { description: 'Project management - monthly', minPrice: 2000, maxPrice: 6000 },
  { description: 'Quality assurance testing', minPrice: 1000, maxPrice: 5000 },
  { description: 'Hosting and maintenance - quarterly', minPrice: 500, maxPrice: 3000 },
  { description: 'Mobile app prototype', minPrice: 5000, maxPrice: 25000 },
  { description: 'Print design - brochures (500)', minPrice: 800, maxPrice: 3000 },
  { description: 'Analytics dashboard setup', minPrice: 2000, maxPrice: 10000 },
  { description: 'CRM customization', minPrice: 3000, maxPrice: 15000 },
] as const;

const TAX_RATES = [0, 0.05, 0.06, 0.065, 0.07, 0.075, 0.08, 0.0825, 0.085, 0.1] as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isoDate(date: Date): string {
  return date.toISOString();
}

function yyyymmdd(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function yyyymm(date: Date): string {
  return date.toISOString().slice(0, 7);
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const logger = new ConsoleLogger();

try {
  const config = new EnvConfig({
    DATABASE_PATH: process.env['DATABASE_PATH'] ?? './tiny-voice.db',
    PDF_GENERATOR: process.env['PDF_GENERATOR'] ?? 'stub',
    LATE_FEES_ENABLED: process.env['LATE_FEES_ENABLED'] ?? 'false',
    LOG_LEVEL: process.env['LOG_LEVEL'] ?? 'info',
    NODE_ENV: process.env['NODE_ENV'] ?? 'development',
  });

  const dbPath = config.get('DATABASE_PATH');
  const migrationsDir = resolve(import.meta.dirname, '../migrations');

  logger.info(`Opening database: ${dbPath}`);
  const db = new SqliteDatabase(dbPath);

  try {
    runMigrations(db, migrationsDir, logger);

    const existing = db.prepare<{ count: number }>('SELECT COUNT(*) as count FROM clients').get();
    if (existing && existing.count > 0) {
      logger.info(`Database already has ${existing.count} clients -- skipping seed. Delete the DB to re-seed.`);
      process.exit(0);
    }

    db.transaction(() => {
      // --- Clients ---
      logger.info('Seeding clients...');
      const clientIds: string[] = [];

      for (let i = 0; i < 15; i++) {
        const id = seededId();
        clientIds.push(id);
        const companyName = faker.company.name();
        const firstName = faker.person.firstName();
        const lastName = faker.person.lastName();
        const domain = faker.internet.domainName();
        const email = faker.internet.email({ firstName, lastName, provider: domain }).toLowerCase();
        const createdAt = isoDate(
          faker.date.between({ from: '2025-01-01', to: '2025-03-01' }),
        );

        db.prepare(
          'INSERT INTO clients (id, name, email, created_at) VALUES (?, ?, ?, ?)',
        ).run(id, companyName, email, createdAt);
      }
      logger.info(`  -> ${clientIds.length} clients`);

      // --- Invoices ---
      logger.info('Seeding invoices...');

      // Target: ~40% paid, ~25% sent, ~20% draft, ~15% void
      const statusPool = faker.helpers.shuffle([
        ...Array.from<string>({ length: 16 }).fill('paid'),
        ...Array.from<string>({ length: 10 }).fill('sent'),
        ...Array.from<string>({ length: 8 }).fill('draft'),
        ...Array.from<string>({ length: 6 }).fill('void'),
      ]);

      const invoices: {
        id: string;
        status: string;
        taxRate: number;
        lineItems: { unitPriceCents: bigint; quantity: number }[];
        createdAt: Date;
      }[] = [];

      for (const status of statusPool) {
        const invoiceId = seededId();
        const clientId = faker.helpers.arrayElement(clientIds);
        const taxRate = faker.helpers.arrayElement(TAX_RATES);
        const createdAt = faker.date.between({ from: '2025-01-15', to: '2025-12-15' });
        const dueDate = addDays(createdAt, faker.number.int({ min: 14, max: 60 }));

        // 1-5 line items, no duplicate descriptions
        const items = faker.helpers
          .arrayElements(SERVICE_CATALOG, { min: 1, max: 5 })
          .map((svc) => ({
            id: seededId(),
            description: svc.description,
            quantity: faker.number.int({ min: 1, max: 10 }),
            unitPriceCents: BigInt(
              faker.number.int({ min: svc.minPrice, max: svc.maxPrice }) * 100,
            ),
          }));

        invoices.push({
          id: invoiceId,
          status,
          taxRate,
          lineItems: items,
          createdAt,
        });

        db.prepare(
          'INSERT INTO invoices (id, client_id, status, tax_rate, due_date, created_at, version) VALUES (?, ?, ?, ?, ?, ?, ?)',
        ).run(invoiceId, clientId, status, taxRate, yyyymmdd(dueDate), isoDate(createdAt), 1);

        for (const item of items) {
          db.prepare(
            'INSERT INTO line_items (id, invoice_id, description, quantity, unit_price_cents) VALUES (?, ?, ?, ?, ?)',
          ).run(item.id, invoiceId, item.description, item.quantity, item.unitPriceCents.toString());
        }
      }
      logger.info(`  -> ${invoices.length} invoices`);

      // --- Payments ---
      logger.info('Seeding payments...');
      let paymentCount = 0;
      const revenueAccumulator = new Map<string, { totalCents: bigint; count: number }>();

      for (const invoice of invoices) {
        if (invoice.status !== 'paid' && invoice.status !== 'sent') continue;

        let subtotalCents = 0n;
        for (const item of invoice.lineItems) {
          subtotalCents += item.unitPriceCents * BigInt(item.quantity);
        }
        const taxCents = BigInt(Math.round(Number(subtotalCents) * invoice.taxRate));
        const totalCents = subtotalCents + taxCents;

        if (invoice.status === 'paid') {
          // 1-3 payments summing to exact total
          const numPayments = faker.number.int({ min: 1, max: Math.min(3, invoice.lineItems.length) });
          let remaining = totalCents;

          for (let p = 0; p < numPayments; p++) {
            const isLast = p === numPayments - 1;
            const amountCents = isLast
              ? remaining
              : (remaining * BigInt(faker.number.int({ min: 30, max: 70 }))) / 100n;
            remaining -= amountCents;

            const recordedAt = addDays(
              invoice.createdAt,
              faker.number.int({ min: 1, max: 45 }),
            );

            db.prepare(
              'INSERT INTO payments (id, invoice_id, amount_cents, recorded_at) VALUES (?, ?, ?, ?)',
            ).run(seededId(), invoice.id, amountCents.toString(), isoDate(recordedAt));
            paymentCount++;

            const month = yyyymm(recordedAt);
            const entry = revenueAccumulator.get(month) ?? { totalCents: 0n, count: 0 };
            entry.totalCents += amountCents;
            entry.count++;
            revenueAccumulator.set(month, entry);
          }
        } else if (invoice.status === 'sent' && faker.datatype.boolean(0.4)) {
          // 40% of sent invoices have a partial payment
          const partialCents =
            (totalCents * BigInt(faker.number.int({ min: 20, max: 80 }))) / 100n;
          const recordedAt = addDays(
            invoice.createdAt,
            faker.number.int({ min: 5, max: 30 }),
          );

          db.prepare(
            'INSERT INTO payments (id, invoice_id, amount_cents, recorded_at) VALUES (?, ?, ?, ?)',
          ).run(seededId(), invoice.id, partialCents.toString(), isoDate(recordedAt));
          paymentCount++;

          const month = yyyymm(recordedAt);
          const entry = revenueAccumulator.get(month) ?? { totalCents: 0n, count: 0 };
          entry.totalCents += partialCents;
          entry.count++;
          revenueAccumulator.set(month, entry);
        }
      }
      logger.info(`  -> ${paymentCount} payments`);

      // --- Revenue projection ---
      logger.info('Seeding revenue_by_month projection...');
      const now = isoDate(new Date(2025, 11, 31, 23, 59, 59));
      for (const [month, data] of revenueAccumulator) {
        db.prepare(
          'INSERT INTO revenue_by_month (month, currency, total_cents, payment_count, updated_at) VALUES (?, ?, ?, ?, ?)',
        ).run(month, 'USD', Number(data.totalCents), data.count, now);
      }
      logger.info(`  -> ${revenueAccumulator.size} months of revenue data`);
    });

    logger.info('Seed complete.');
  } finally {
    db.close();
  }
} catch (err) {
  logger.error('Seed failed', { error: err instanceof Error ? err.message : String(err) });
  process.exit(1);
}
