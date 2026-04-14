import type { Config } from '../config/config';
import type { FlagName } from './flag-name';
import type { FeatureFlags } from './feature-flags';

/**
 * Maps flag names to Config keys containing booleans.
 */
const FLAG_TO_CONFIG_KEY = {
  lateFees: 'LATE_FEES_ENABLED',
} as const satisfies Record<FlagName, string>;

/**
 * Real adapter: reads boolean flags from Config.
 */
export class ConfigFeatureFlags implements FeatureFlags {
  constructor(private readonly config: Config) {}

  isEnabled(flag: FlagName): boolean {
    const key = FLAG_TO_CONFIG_KEY[flag];
    return this.config.get(key) as boolean;
  }
}
