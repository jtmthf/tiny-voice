import 'server-only';
import { buildApp } from './build-app';
import type { AppDeps } from './app-deps';

const app = buildApp();

/**
 * Module singleton — the fully wired application instance.
 * RSCs and the oRPC route handler import this.
 */
export const instance: AppDeps = app;
export { app };
