import type { FlagName } from './flag-name';
import type { FeatureFlags } from './feature-flags';

/**
 * Test adapter: explicit flag values.
 */
export class InMemoryFeatureFlags implements FeatureFlags {
  constructor(private readonly flags: Record<FlagName, boolean>) {}

  isEnabled(flag: FlagName): boolean {
    return this.flags[flag];
  }
}
