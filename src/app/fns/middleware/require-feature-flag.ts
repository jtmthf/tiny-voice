import { createMiddleware } from '@tanstack/react-start';
import { getAppReadView } from '@/app/instance';
import type { FlagName } from '@/shared/flags/flag-name';

/**
 * Dispatch-boundary feature-flag gate. Throws before the handler runs when
 * the flag is off, keeping domain commands flag-unaware (rule #7).
 */
export function requireFeatureFlag(flag: FlagName) {
  return createMiddleware({ type: 'function' }).server(async ({ next }) => {
    if (!getAppReadView().featureFlags.isEnabled(flag)) {
      throw new Error('Feature is disabled');
    }
    return next();
  });
}
