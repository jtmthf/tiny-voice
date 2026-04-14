import type { Config, ConfigKey, ConfigValues } from './config';

const DEFAULTS: ConfigValues = {
  DATABASE_PATH: ':memory:',
  PDF_GENERATOR: 'stub',
  LATE_FEES_ENABLED: false,
  LOG_LEVEL: 'info',
  NODE_ENV: 'test',
};

/**
 * Test adapter: takes partial config and fills defaults.
 */
export class InMemoryConfig implements Config {
  private readonly values: ConfigValues;

  constructor(overrides: Partial<ConfigValues> = {}) {
    this.values = { ...DEFAULTS, ...overrides };
  }

  get<K extends ConfigKey>(key: K): ConfigValues[K] {
    return this.values[key];
  }
}
