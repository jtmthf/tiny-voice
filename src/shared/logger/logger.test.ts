import { describe, expect, it } from 'vitest';
import { CapturingLogger } from './capturing-logger';

describe('CapturingLogger', () => {
  it('captures info entries', () => {
    const logger = new CapturingLogger();
    logger.info('hello', { key: 'val' });
    expect(logger.entries).toHaveLength(1);
    expect(logger.entries[0]).toEqual({
      level: 'info',
      message: 'hello',
      meta: { key: 'val' },
    });
  });

  it('captures all levels', () => {
    const logger = new CapturingLogger();
    logger.info('i');
    logger.warn('w');
    logger.error('e');
    logger.debug('d');
    expect(logger.entries.map((e) => e.level)).toEqual(['info', 'warn', 'error', 'debug']);
  });

  it('clear empties entries', () => {
    const logger = new CapturingLogger();
    logger.info('hi');
    logger.clear();
    expect(logger.entries).toHaveLength(0);
  });
});
