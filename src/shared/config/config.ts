/**
 * Port interface for typed configuration access.
 */

export type ConfigKey = 'DATABASE_PATH' | 'PDF_GENERATOR' | 'LATE_FEES_ENABLED' | 'LOG_LEVEL' | 'NODE_ENV';

export interface ConfigValues {
  readonly DATABASE_PATH: string;
  readonly PDF_GENERATOR: 'pdfkit' | 'stub';
  readonly LATE_FEES_ENABLED: boolean;
  readonly LOG_LEVEL: 'debug' | 'info' | 'warn' | 'error';
  readonly NODE_ENV: 'development' | 'production' | 'test';
}

export interface Config {
  get<K extends ConfigKey>(key: K): ConfigValues[K];
}
