import {
  __resetHinglishLexiconForTests,
  getHinglishPhraseCorrection,
  getHinglishSuggestions,
  isHinglishHeadword,
} from './hinglishDictionary';

describe('hinglishDictionary typebase packs', () => {
  beforeEach(() => {
    __resetHinglishLexiconForTests();
  });

  it('includes TypeBase headwords', () => {
    expect(isHinglishHeadword('namaste')).toBe(true);
    expect(isHinglishHeadword('achha')).toBe(true);
  });

  it('expands run-on phrases from flat pack', () => {
    expect(getHinglishPhraseCorrection('aarahahoon')).toBe('aa raha hoon');
    expect(getHinglishPhraseCorrection('aajraat')).toBe('aaj raat');
  });

  it('suggests spaced phrases from TypeBase packs', () => {
    const suggestions = getHinglishSuggestions('aa rah', 5);
    expect(suggestions.some(s => s.includes('aa raha'))).toBe(true);
  });
});
