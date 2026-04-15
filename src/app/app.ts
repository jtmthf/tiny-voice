import 'server-only';
import { cache } from 'react';
import { buildApp } from './build-app';
import type { AppReadView } from './app-deps';

const getAppInstance = cache((): AppReadView => buildApp());

/**
 * Read-only view for RSC pages — queries, feature flags, and clock only.
 * Repos, event bus, and infrastructure are not exposed. Mutations go
 * through Server Actions / RPC context, not through this singleton.
 *
 * Lazily initialized on first property access via `react/cache`,
 * so `buildApp()` does not run at import time.
 */
export const app: AppReadView = {
  get queries() { return getAppInstance().queries; },
  get featureFlags() { return getAppInstance().featureFlags; },
  get clock() { return getAppInstance().clock; },
};
