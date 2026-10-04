import {
  containsSnippetPlaceholders,
  expandBuiltinPlaceholder,
  expandSnippetValue,
} from './snippetExpand';

describe('snippetExpand', () => {
  it('detects brace and semicolon placeholders', () => {
    expect(containsSnippetPlaceholders('Hello {date}')).toBe(true);
    expect(containsSnippetPlaceholders('Hello ;time')).toBe(true);
    expect(containsSnippetPlaceholders('plain text')).toBe(false);
  });

  it('expands brace placeholders', () => {
    const now = new Date('2026-09-21T14:30:00');
    const out = expandSnippetValue('{date} @ {time} | {clipboard}', {
      now,
      clipboardText: 'clip',
    });
    expect(out).toContain('clip');
    expect(out).not.toContain('{clipboard}');
    expect(out).not.toContain('{time}');
    expect(out).not.toContain('{date}');
  });

  it('expands semicolon placeholders', () => {
    const now = new Date('2026-09-21T14:30:00');
    const out = expandSnippetValue('Due ;date by ;time', {now});
    expect(out).not.toContain(';date');
    expect(out).not.toContain(';time');
    expect(out.length).toBeGreaterThan('Due  by '.length);
  });

  it('expandBuiltinPlaceholder for ;time token', () => {
    const out = expandBuiltinPlaceholder('time');
    expect(out).not.toContain(';time');
    expect(out.length).toBeGreaterThan(0);
  });
});
