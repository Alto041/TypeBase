import {
  buildTypeLiftLatticePlan,
  needsLatticeDisambiguation,
  resolveTokenWithSymSpell,
} from './typeLiftEngine';

jest.mock('./dictionaryManager', () => ({
  hasDictionaryWord: (word: string) =>
    ['the', 'hello', 'world', 'everyone', 'are', 'button'].includes(
      word.toLowerCase(),
    ),
  lookupCandidatesSync: () => [],
}));

jest.mock('./englishFrequencyDictionary', () => ({
  isEnglishDictionaryWord: (word: string) =>
    ['are', 'button', 'the', 'hello'].includes(word.toLowerCase()),
  getEnglishStaticRank: (word: string) => {
    const ranks: Record<string, number> = {are: 50, button: 800, the: 1, hello: 900};
    return ranks[word.toLowerCase()];
  },
}));

jest.mock('./contextCorrectionEngine', () => ({
  getContextCorrectionCandidate: () => null,
}));

describe('typeLiftEngine', () => {
  it('builds a lattice for unknown words', () => {
    const plan = buildTypeLiftLatticePlan('aare quick brown', '');
    expect(plan.lattices.length).toBe(1);
    expect(plan.lattices[0]?.candidates).toContain('are');
  });

  it('resolves a single token with SymSpell only', () => {
    expect(resolveTokenWithSymSpell('teh', '')).toBe(null);
  });

  it('builds lattices for double-letter typos without SymSpell', () => {
    const plan = buildTypeLiftLatticePlan('aare bbutton', '');
    expect(plan.lattices.length).toBe(2);
    expect(plan.lattices[0]?.candidates).toContain('are');
    expect(plan.lattices[1]?.candidates).toContain('button');
  });

  it('fixes double-letter typos via lattice picks', () => {
    expect(resolveTokenWithSymSpell('aare', '')).toBe('are');
    expect(resolveTokenWithSymSpell('bbutton', '')).toBe('button');
  });

  it('needs disambiguation when multiple distinct fixes exist', () => {
    const plan = buildTypeLiftLatticePlan('teh', '');
    plan.lattices[0] = {
      wordIndex: 0,
      original: 'teh',
      candidates: ['the', 'tee'],
    };
    expect(needsLatticeDisambiguation(plan)).toBe(true);
  });

  it('skips disambiguation for a single clear candidate', () => {
    const plan = buildTypeLiftLatticePlan('aare', '');
    expect(needsLatticeDisambiguation(plan)).toBe(false);
  });
});
