import { createServerOnlyFn } from '@tanstack/react-start';
import { buildApp } from './build-app';
import type { AppDeps, AppReadView } from './app-deps';

let _instance: AppDeps | null = null;

/**
 * Mutation server-function entry point. Wrapped with `createServerOnlyFn` so
 * the TanStack Start client bundle replaces the body with a stub that throws
 * if a client component imports it (rule #8).
 */
export const getAppInstance = createServerOnlyFn((): AppDeps => {
  if (!_instance) {
    _instance = buildApp();
  }
  return _instance;
});

/**
 * Narrow read-only view for query server functions. Returns the same singleton
 * but typed so handlers cannot reach repos, the event bus, or infrastructure.
 */
export const getAppReadView = createServerOnlyFn((): AppReadView => getAppInstance());

/**
 * Test-only injection. Allows server-function tests to swap the singleton
 * for an in-memory `buildTestApp()`. Reset between tests.
 */
export function setAppInstanceForTesting(app: AppDeps | null): void {
  _instance = app;
}
