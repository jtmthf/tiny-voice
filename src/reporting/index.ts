// --- Ports ---
export type { RevenueReadModel, MonthlyRevenue } from './ports/revenue-read-model';

// --- Adapters ---
export { SqliteRevenueReadModel } from './adapters/sqlite-revenue-read-model';
export { InMemoryRevenueReadModel } from './adapters/in-memory-revenue-read-model';

// --- Projections ---
export { registerRevenueProjection } from './projections/register-revenue-projection';

// --- Queries ---
export { getRevenueByMonth } from './queries/get-revenue-by-month';
export { getRevenueByYear } from './queries/get-revenue-by-year';
