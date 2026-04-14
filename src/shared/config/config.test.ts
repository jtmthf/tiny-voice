import { describe, expect, it } from 'vitest';
import { EnvConfig } from './env-config';
import { InMemoryConfig } from './in-memory-config';

const VALID_ENV = {
  DATABASE_PATH: './data/db.sqlite',
  PDF_GENERATOR: 'pdfkit',
  LATE_FEES_ENABLED: 'true',
  LOG_LEVEL: 'info',
  NODE_ENV: 'development',
};

describe('EnvConfig', () => {
  it('parses a valid environment', () => {
    const config = new EnvConfig(VALID_ENV);
    expect(config.get('DATABASE_PATH')).toBe('./data/db.sqlite');
    expect(config.get('PDF_GENERATOR')).toBe('pdfkit');
    expect(config.get('LATE_FEES_ENABLED')).toBe(true);
    expect(config.get('LOG_LEVEL')).toBe('info');
    expect(config.get('NODE_ENV')).toBe('development');
  });

  it('fails fast on missing keys', () => {
    expect(() => new EnvConfig({})).toThrow('Invalid configuration');
  });

  it('fails fast on malformed values', () => {
    expect(() => new EnvConfig({ ...VALID_ENV, LOG_LEVEL: 'verbose' })).toThrow('Invalid configuration');
  });

  it('parses LATE_FEES_ENABLED as boolean', () => {
    const config = new EnvConfig({ ...VALID_ENV, LATE_FEES_ENABLED: 'false' });
    expect(config.get('LATE_FEES_ENABLED')).toBe(false);
  });
});

describe('InMemoryConfig', () => {
  it('returns defaults when no overrides', () => {
    const config = new InMemoryConfig();
    expect(config.get('DATABASE_PATH')).toBe(':memory:');
    expect(config.get('PDF_GENERATOR')).toBe('stub');
    expect(config.get('LATE_FEES_ENABLED')).toBe(false);
    expect(config.get('LOG_LEVEL')).toBe('info');
    expect(config.get('NODE_ENV')).toBe('test');
  });

  it('allows overrides', () => {
    const config = new InMemoryConfig({ LOG_LEVEL: 'debug', LATE_FEES_ENABLED: true });
    expect(config.get('LOG_LEVEL')).toBe('debug');
    expect(config.get('LATE_FEES_ENABLED')).toBe(true);
  });
});
