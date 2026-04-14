import 'server-only';
import { buildApp } from './build-app';
import type { AppReadView } from './app-deps';

/**
 * Read-only view for RSC pages — queries, feature flags, and clock only.
 * Repos, event bus, and infrastructure are not exposed. Mutations go
 * through Server Actions / RPC context, not through this singleton.
 */
export const app: AppReadView = buildApp();
