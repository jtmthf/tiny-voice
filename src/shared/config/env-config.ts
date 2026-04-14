import type { Config, ConfigKey, ConfigValues } from './config';
import { ConfigSchema } from './config-schema';

/**
 * Real adapter: reads from process.env, validates with Zod, fails fast
 * with an aggregated error if any keys are missing or malformed.
 */
export class EnvConfig implements Config {
  private readonly values: ConfigValues;

  constructor(env: Record<string, string | undefined> = process.env) {
    const result = ConfigSchema.safeParse({
      DATABASE_PATH: env['DATABASE_PATH'],
      PDF_GENERATOR: env['PDF_GENERATOR'],
      LATE_FEES_ENABLED: env['LATE_FEES_ENABLED'],
      LOG_LEVEL: env['LOG_LEVEL'],
      NODE_ENV: env['NODE_ENV'],
    });

    if (!result.success) {
      const issues = result.error.issues
        .map((i) => `  ${i.path.join('.')}: ${i.message}`)
        .join('\n');
      throw new Error(`Invalid configuration:\n${issues}`);
    }

    this.values = result.data;
  }

  get<K extends ConfigKey>(key: K): ConfigValues[K] {
    return this.values[key];
  }
}
