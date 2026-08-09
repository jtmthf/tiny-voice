import type { Config, ConfigKey } from '../config/config';
import type { FlagName } from './flag-name';
import type { FeatureFlags } from './feature-flags';

/**
 * Maps flag names to Config keys containing booleans.
 */
const FLAG_TO_CONFIG_KEY = {
  lateFees: 'LATE_FEES_ENABLED',
} as const satisfies Record<FlagName, ConfigKey>;

/**
 * Real adapter: reads boolean flags from Config.
 */
export class ConfigFeatureFlags implements FeatureFlags {
  private readonly config: Config;

  constructor(config: Config) {
    this.config = config;
  }

  isEnabled(flag: FlagName): boolean {
    const key = FLAG_TO_CONFIG_KEY[flag];
    return this.config.get(key);
  }
}
