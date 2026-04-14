import { describe, expect, it } from 'vitest';
import { ConfigFeatureFlags } from './config-feature-flags';
import { InMemoryFeatureFlags } from './in-memory-feature-flags';
import { InMemoryConfig } from '../config/in-memory-config';

describe('ConfigFeatureFlags', () => {
  it('returns true when config flag is enabled', () => {
    const config = new InMemoryConfig({ LATE_FEES_ENABLED: true });
    const flags = new ConfigFeatureFlags(config);
    expect(flags.isEnabled('lateFees')).toBe(true);
  });

  it('returns false when config flag is disabled', () => {
    const config = new InMemoryConfig({ LATE_FEES_ENABLED: false });
    const flags = new ConfigFeatureFlags(config);
    expect(flags.isEnabled('lateFees')).toBe(false);
  });
});

describe('InMemoryFeatureFlags', () => {
  it('returns the configured value', () => {
    const flags = new InMemoryFeatureFlags({ lateFees: true });
    expect(flags.isEnabled('lateFees')).toBe(true);
  });

  it('returns false when disabled', () => {
    const flags = new InMemoryFeatureFlags({ lateFees: false });
    expect(flags.isEnabled('lateFees')).toBe(false);
  });
});
