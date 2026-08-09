import { describe, it, expect } from 'vitest';
import { parseBracketNotation } from './parse-bracket-notation';

describe('parseBracketNotation', () => {
  it('parses a single line item into a nested object', () => {
    const data = new FormData();
    data.append('clientId', 'client-1');
    data.append('taxRate', '10');
    data.append('dueDate', '2025-02-01');
    data.append('lineItems[0][description]', 'Consulting');
    data.append('lineItems[0][quantity]', '2');
    data.append('lineItems[0][unitPriceCents]', '1000');

    expect(parseBracketNotation(data)).toEqual({
      clientId: 'client-1',
      taxRate: '10',
      dueDate: '2025-02-01',
      lineItems: [{ description: 'Consulting', quantity: '2', unitPriceCents: '1000' }],
    });
  });

  it('parses multiple line items into an ordered array', () => {
    const data = new FormData();
    data.append('lineItems[0][description]', 'First');
    data.append('lineItems[1][description]', 'Second');

    expect(parseBracketNotation(data)).toEqual({
      lineItems: [{ description: 'First' }, { description: 'Second' }],
    });
  });

  it('throws on a top-level __proto__ key and does not pollute Object.prototype', () => {
    const data = new FormData();
    data.append('__proto__[x]', 'polluted');

    expect(() => parseBracketNotation(data)).toThrow();
    expect(({} as Record<string, unknown>)['x']).toBeUndefined();
  });

  it('throws on a constructor[prototype] key and does not pollute Object.prototype', () => {
    const data = new FormData();
    data.append('constructor[prototype][x]', 'polluted');

    expect(() => parseBracketNotation(data)).toThrow();
    expect(({} as Record<string, unknown>)['x']).toBeUndefined();
  });

  it('throws on a nested __proto__ key and does not pollute Object.prototype', () => {
    const data = new FormData();
    data.append('a[__proto__][x]', 'polluted');

    expect(() => parseBracketNotation(data)).toThrow();
    expect(({} as Record<string, unknown>)['x']).toBeUndefined();
  });
});
