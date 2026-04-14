import type { FlagName } from './flag-name';

/**
 * Port interface for feature flag checks.
 */
export interface FeatureFlags {
  isEnabled(flag: FlagName): boolean;
}
