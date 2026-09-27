import {wrapGemmaPrompt} from '../ai/gemmaPrompts';
import {generateOnDeviceText} from '../ai/onDeviceTextAi';
import {applyCaseToWord} from '../suggestions/wordSuggestions';
import {getContextCorrectionCandidate} from './contextCorrectionEngine';
import {hasDictionaryWord, lookupCandidatesSync} from './dictionaryManager';
import {
  getEnglishStaticRank,
  isEnglishDictionaryWord,
} from './englishFrequencyDictionary';
import {isFaithfulTypeLiftCorrection} from './typeLiftFaithfulness';

const LOG_PREFIX = '[TypeLiftEngine]';
const MAX_LATTICE_CANDIDATES = 6;
const MIN_WORD_LENGTH = 3;

export type TypeLiftTokenLattice = {
  /** Index in the whitespace-delimited word list. */
  wordIndex: number;
  original: string;
  candidates: string[];
};

export type TypeLiftLatticePlan = {
  snippet: string;
  words: string[];
  lattices: TypeLiftTokenLattice[];
};

type LatticePickResponse = {
  no_change?: boolean;
  picks?: Record<string, number>;
};

function splitWords(snippet: string): string[] {
  return snippet.match(/\S+/g) ?? [];
}

function wordLetters(token: string): string {
  return token.replace(/[^\p{L}\p{M}']/gu, '');
}

function isSuspiciousWord(token: string): boolean {
  const core = wordLetters(token);
  const lower = core.toLowerCase();
  if (lower.length < MIN_WORD_LENGTH) {
    return false;
  }
  if (!/^[\p{L}][\p{L}'-]*$/u.test(lower)) {
    return false;
  }
  if (hasDictionaryWord(lower)) {
    if (core.length > 1 && /[a-z]/.test(core) && /[A-Z]/.test(core.slice(1))) {
      return true;
    }
    return false;
  }
  return true;
}

/** Fat-finger double letters (aare, bbutton) — works before SymSpell is warm. */
function repeatedLetterCollapseCandidates(token: string): string[] {
  const lower = wordLetters(token).toLowerCase();
  if (lower.length < MIN_WORD_LENGTH) {
    return [];
  }
  const out: string[] = [];
  for (let i = 1; i < lower.length; i += 1) {
    if (lower[i] !== lower[i - 1]) {
      continue;
    }
    const collapsed = lower.slice(0, i) + lower.slice(i + 1);
    if (collapsed.length < 2 || out.includes(collapsed)) {
      continue;
    }
    if (
      isEnglishDictionaryWord(collapsed) ||
      getEnglishStaticRank(collapsed) != null
    ) {
      out.push(collapsed);
    }
  }
  return out;
}

function symspellCandidatesForWord(typed: string): string[] {
  const lower = wordLetters(typed).toLowerCase();
  if (!lower) {
    return [];
  }
  const hits = lookupCandidatesSync(lower, 2, MAX_LATTICE_CANDIDATES);
  const out: string[] = [];
  for (const hit of hits) {
    if (hit.word.toLowerCase() === lower) {
      continue;
    }
    if (!out.includes(hit.word)) {
      out.push(hit.word);
    }
  }
  return out.slice(0, MAX_LATTICE_CANDIDATES);
}

function candidatesForWord(
  token: string,
  contextBefore: string,
  snippet: string,
  wordIndex: number,
  words: string[],
): string[] {
  const core = wordLetters(token);
  const lower = core.toLowerCase();
  const previousWord = wordIndex > 0 ? wordLetters(words[wordIndex - 1]!).toLowerCase() : '';
  const trailingWords = words
    .slice(wordIndex + 1, wordIndex + 3)
    .map(w => wordLetters(w).toLowerCase())
    .filter(Boolean);

  const prefixWords = words.slice(0, wordIndex + 1).join(' ');
  const context = `${contextBefore}${prefixWords}`.trim();

  const contextFix = getContextCorrectionCandidate(core, context, {
    previousWord,
    trailingWords,
    lightweight: true,
  });

  const fromSym = symspellCandidatesForWord(token);
  const merged: string[] = [];

  for (const word of repeatedLetterCollapseCandidates(token)) {
    if (!merged.includes(word)) {
      merged.push(word);
    }
  }
  if (contextFix?.correction) {
    merged.push(contextFix.correction.toLowerCase());
  }
  for (const word of fromSym) {
    const w = word.toLowerCase();
    if (!merged.includes(w)) {
      merged.push(w);
    }
  }

  return merged.slice(0, MAX_LATTICE_CANDIDATES);
}

/** Build SymSpell + context candidate lattices for suspicious tokens in a snippet. */
export function buildTypeLiftLatticePlan(
  snippet: string,
  contextBefore: string,
): TypeLiftLatticePlan {
  const words = splitWords(snippet);
  const lattices: TypeLiftTokenLattice[] = [];

  words.forEach((word, wordIndex) => {
    if (!isSuspiciousWord(word)) {
      return;
    }
    const candidates = candidatesForWord(
      word,
      contextBefore,
      snippet,
      wordIndex,
      words,
    );
    if (candidates.length === 0) {
      return;
    }
    lattices.push({wordIndex, original: word, candidates});
  });

  return {snippet, words, lattices};
}

/** True when Gemma should choose among multiple listed candidates for at least one token. */
export function needsLatticeDisambiguation(plan: TypeLiftLatticePlan): boolean {
  return plan.lattices.some(lattice => lattice.candidates.length >= 2);
}

function applyWordReplacements(
  snippet: string,
  words: string[],
  replacements: Map<number, string>,
): string {
  if (replacements.size === 0) {
    return snippet;
  }

  let wordIndex = -1;
  return snippet.replace(/\S+/g, token => {
    wordIndex += 1;
    const next = replacements.get(wordIndex);
    if (!next || next === token) {
      return token;
    }
    return applyCaseToWord(next, token);
  });
}

function pickBestSymSpellOnly(plan: TypeLiftLatticePlan): string | null {
  const replacements = new Map<number, string>();

  for (const lattice of plan.lattices) {
    const best = lattice.candidates[0];
    if (!best) {
      continue;
    }
    const cased = applyCaseToWord(best, lattice.original);
    if (cased.toLowerCase() !== wordLetters(lattice.original).toLowerCase()) {
      replacements.set(lattice.wordIndex, best);
    }
  }

  if (replacements.size === 0) {
    return null;
  }

  const merged = applyWordReplacements(plan.snippet, plan.words, replacements);
  return merged !== plan.snippet ? merged : null;
}

function parseLatticePickResponse(raw: string): LatticePickResponse | null {
  const trimmed = raw.trim();
  const jsonText = trimmed.startsWith('```')
    ? trimmed.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '')
    : trimmed;

  const start = jsonText.indexOf('{');
  const end = jsonText.lastIndexOf('}');
  if (start < 0 || end <= start) {
    return null;
  }

  try {
    return JSON.parse(jsonText.slice(start, end + 1)) as LatticePickResponse;
  } catch {
    return null;
  }
}

function applyLatticePicks(
  plan: TypeLiftLatticePlan,
  picks: Record<string, number>,
): string | null {
  const replacements = new Map<number, string>();

  for (const lattice of plan.lattices) {
    const pickIndex = picks[String(lattice.wordIndex)];
    if (pickIndex == null || pickIndex < 0 || pickIndex >= lattice.candidates.length) {
      continue;
    }
    const chosen = lattice.candidates[pickIndex];
    if (!chosen) {
      continue;
    }
    replacements.set(lattice.wordIndex, chosen);
  }

  if (replacements.size === 0) {
    return null;
  }

  const merged = applyWordReplacements(plan.snippet, plan.words, replacements);
  return merged !== plan.snippet ? merged : null;
}

function escapePromptLiteral(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\r?\n/g, ' ');
}

export function buildGemmaTypeLiftLatticePrompt(plan: TypeLiftLatticePlan): string {
  const lines = plan.lattices.map(lattice => {
    const opts = lattice.candidates.map((c, i) => `${i}:${c}`).join(', ');
    return `word ${lattice.wordIndex} "${escapePromptLiteral(lattice.original)}" -> [${opts}]`;
  });

  return wrapGemmaPrompt(`Fix typos in the message by picking candidate indices. Do not rephrase.

Rules:
- Return ONLY JSON: {"picks":{"<wordIndex>":<candidateIndex>,...}} or {"no_change":true}
- Each index must be from the listed options for that word.
- If nothing should change, return {"no_change":true}

Message:
"${escapePromptLiteral(plan.snippet)}"

Options:
${lines.join('\n')}`);
}

/**
 * SymSpell + context lattice first; optional constrained Gemma picks on-device.
 */
export async function resolveOnDeviceTypeLiftHybrid(
  snippet: string,
  contextBefore: string,
): Promise<string | null> {
  const plan = buildTypeLiftLatticePlan(snippet, contextBefore);

  if (plan.lattices.length === 0) {
    console.log(LOG_PREFIX, 'no suspicious tokens', {snippet});
    return null;
  }

  const symOnly = pickBestSymSpellOnly(plan);

  if (!needsLatticeDisambiguation(plan)) {
    if (symOnly && symOnly !== snippet) {
      console.log(LOG_PREFIX, 'symspell-only fix', {snippet, symOnly});
      return symOnly;
    }
    console.log(LOG_PREFIX, 'skip gemma: single-candidate lattice', {snippet});
    return null;
  }

  console.log(LOG_PREFIX, 'gemma disambiguation', {
    snippet,
    tokens: plan.lattices.length,
  });

  try {
    const prompt = buildGemmaTypeLiftLatticePrompt(plan);
    const raw = await generateOnDeviceText(prompt, {temperature: 0});
    const parsed = parseLatticePickResponse(raw);
    if (parsed?.no_change) {
      console.log(LOG_PREFIX, 'gemma lattice: no_change');
      return symOnly && symOnly !== snippet ? symOnly : null;
    }
    if (parsed?.picks) {
      const merged = applyLatticePicks(plan, parsed.picks);
      if (merged && merged !== snippet) {
        console.log(LOG_PREFIX, 'gemma lattice picks', {snippet, merged});
        return merged;
      }
    }
  } catch (error) {
    console.warn(LOG_PREFIX, 'constrained gemma failed', error);
  }

  if (symOnly && symOnly !== snippet) {
    return symOnly;
  }

  return null;
}

/** Single-token path: SymSpell + context before asking Gemma for a whole word rewrite. */
export function resolveTokenWithSymSpell(
  token: string,
  contextBefore: string,
): string | null {
  const plan = buildTypeLiftLatticePlan(token, contextBefore);
  if (plan.lattices.length === 0) {
    return null;
  }
  const merged = pickBestSymSpellOnly(plan);
  if (!merged || merged === token) {
    return null;
  }
  if (!isFaithfulTypeLiftCorrection(token, merged, 'suggest')) {
    return null;
  }
  return merged;
}
