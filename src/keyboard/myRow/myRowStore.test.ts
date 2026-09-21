import {
  addMyRowPin,
  buildMyRowKeyDefinitions,
  MY_ROW_SLOT_COUNT,
  normalizeMyRowPin,
  parseMyRowPinFromPaste,
} from './myRowStore';

describe('buildMyRowKeyDefinitions', () => {
  it('puts pins first and dedupes', () => {
    const keys = buildMyRowKeyDefinitions(['$', '$', '@'], {'#': 99});
    expect(keys.map(k => k.value)).toEqual([
      '$',
      '@',
      '#',
      '.',
      ',',
      '-',
      '(',
      ')',
      '/',
      '!',
    ]);
    expect(keys).toHaveLength(MY_ROW_SLOT_COUNT);
  });

  it('ranks learned symbols after pins', () => {
    const keys = buildMyRowKeyDefinitions([], {'%': 5, '&': 10});
    expect(keys.slice(0, 2).map(k => k.value)).toEqual(['&', '%']);
  });

  it('includes custom unicode pins', () => {
    const keys = buildMyRowKeyDefinitions(['₹', '→'], {});
    expect(keys[0].value).toBe('₹');
    expect(keys[1].value).toBe('→');
  });
});

describe('parseMyRowPinFromPaste', () => {
  it('extracts first symbol from noisy clipboard text', () => {
    expect(parseMyRowPinFromPaste('  ₹ copied ')).toBe('₹');
  });

  it('rejects plain words', () => {
    expect(parseMyRowPinFromPaste('hello')).toBeNull();
  });
});

describe('addMyRowPin', () => {
  it('dedupes and caps pin list', () => {
    const pins = ['@', '#', '.', ',', '-', '(', ')', '/', '!', '?'];
    const next = addMyRowPin(pins, '€');
    expect(next).toHaveLength(MY_ROW_SLOT_COUNT);
    expect(next!.includes('€')).toBe(true);
    expect(next!.includes('@')).toBe(false);
  });
});
