import type { FlagName } from './flag-name';
import type { FeatureFlags } from './feature-flags';

/**
 * Test adapter: explicit flag values.
 */
export class InMemoryFeatureFlags implements FeatureFlags {
  private readonly flags: Record<FlagName, boolean>;

  constructor(flags: Record<FlagName, boolean>) {
    this.flags = flags;
  }

  isEnabled(flag: FlagName): boolean {
    return this.flags[flag];
  }
}
