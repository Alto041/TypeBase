import {
  isEssentialTriggerPrefix,
  resolveEssentialExpansion,
} from './essentialsTrigger';

describe('resolveEssentialExpansion', () => {
  it('expands ;time without a saved snippet', () => {
    const result = resolveEssentialExpansion('Hello ;time');
    expect(result).not.toBeNull();
    expect(result!.triggerLength).toBe(5);
    expect(result!.value.length).toBeGreaterThan(0);
    expect(result!.value).not.toContain(';time');
  });

  it('expands ;date', () => {
    const result = resolveEssentialExpansion('Note ;date');
    expect(result).not.toBeNull();
    expect(result!.triggerLength).toBe(5);
    expect(result!.value.length).toBeGreaterThan(0);
  });

  it('does not expand unknown ;keyword', () => {
    expect(resolveEssentialExpansion('Hi ;mysnippet')).toBeNull();
  });

  it('detects essential trigger prefixes', () => {
    expect(isEssentialTriggerPrefix(';email')).toBe(true);
    expect(isEssentialTriggerPrefix(';time')).toBe(true);
    expect(isEssentialTriggerPrefix('hello')).toBe(false);
  });
});
