/**
 * Minimal, self-contained SymSpell implementation (v6-inspired Symmetric Delete).
 * - No external dependencies.
 * - Focused on CreateDictionaryEntry, Lookup, and LookupCompound.
 * - Suitable for ~10k-50k word dictionaries in React Native.
 *
 * References the public SymSpell algorithm by Wolf Garbe.
 */

export enum Verbosity {
  /** Only the closest suggestion (lowest edit distance). */
  Top = 0,
  /** All suggestions with the smallest edit distance found. */
  Closest = 1,
  /** All suggestions within maxEditDistance. */
  All = 2,
}

export type Suggestion = {
  term: string;
  /** Edit distance (0 = exact or known word). */
  distance: number;
  /** Frequency / count (higher = more common). */
  count: number;
};

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const v0 = new Array<number>(b.length + 1);
  const v1 = new Array<number>(b.length + 1);

  for (let i = 0; i <= b.length; i++) v0[i] = i;

  for (let i = 0; i < a.length; i++) {
    v1[0] = i + 1;
    for (let j = 0; j < b.length; j++) {
      const cost = a[i] === b[j] ? 0 : 1;
      v1[j + 1] = Math.min(
        v1[j] + 1, // deletion
        v0[j + 1] + 1, // insertion
        v0[j] + cost, // substitution
      );
    }
    for (let j = 0; j <= b.length; j++) v0[j] = v1[j];
  }
  return v1[b.length];
}

/**
 * SymSpell class.
 */
export class SymSpell {
  private readonly maxDictionaryEditDistance: number;
  private readonly prefixLength: number;

  /** term (lowercase) -> frequency count */
  private readonly words = new Map<string, number>();

  /** delete-key (lowercase) -> array of original terms that have this delete */
  private readonly deletes = new Map<string, string[]>();

  constructor(
    /** Rough initial size hint (not strictly required). */
    _initialCapacity = 16,
    maxDictionaryEditDistance = 2,
    prefixLength = 7,
  ) {
    this.maxDictionaryEditDistance = maxDictionaryEditDistance;
    this.prefixLength = prefixLength;
  }

  /**
   * Add or increment a term in the dictionary.
   * Returns true if the term was new (first time seen).
   */
  CreateDictionaryEntry(term: string, count: number): boolean {
    if (!term) return false;
    const key = term.toLowerCase();
    const prev = this.words.get(key) ?? 0;
    this.words.set(key, prev + count);

    if (prev > 0) {
      // Already present; we just boosted the count. Deletes already registered.
      return false;
    }

    // Register all relevant deletes for this new term.
    const keyDeletes = this.getWithinEditDistanceDeletes(key, this.maxDictionaryEditDistance);
    for (const del of keyDeletes) {
      let list = this.deletes.get(del);
      if (!list) {
        list = [];
        this.deletes.set(del, list);
      }
      list.push(key);
    }
    return true;
  }

  /** Number of unique words loaded. */
  get WordCount(): number {
    return this.words.size;
  }

  /**
   * Lookup suggestions for a (possibly misspelled) word.
   */
  Lookup(
    input: string,
    verbosity: Verbosity,
    maxEditDistance: number = this.maxDictionaryEditDistance,
  ): Suggestion[] {
    if (!input) return [];
    const inputLower = input.toLowerCase();

    // Exact match is always best.
    const exactCount = this.words.get(inputLower);
    if (exactCount !== undefined) {
      return [{ term: inputLower, distance: 0, count: exactCount }];
    }

    const suggestions: Suggestion[] = [];
    const seen = new Set<string>();

    // Collect candidates via delete index (the heart of SymSpell).
    const inputDeletes = this.getWithinEditDistanceDeletes(inputLower, maxEditDistance);
    for (const del of inputDeletes) {
      const candidates = this.deletes.get(del);
      if (!candidates) continue;
      for (const cand of candidates) {
        if (seen.has(cand)) continue;
        seen.add(cand);

        const dist = levenshtein(inputLower, cand);
        if (dist <= maxEditDistance && this.words.has(cand)) {
          suggestions.push({
            term: cand,
            distance: dist,
            count: this.words.get(cand)!,
          });
        }
      }
    }

    // If nothing found within the delete index, fall back to a very small direct scan
    // for extremely close items (helps for very short inputs or edge cases).
    if (suggestions.length === 0 && maxEditDistance >= 1) {
      for (const [term, cnt] of this.words) {
        if (Math.abs(term.length - inputLower.length) > maxEditDistance) continue;
        const dist = levenshtein(inputLower, term);
        if (dist <= maxEditDistance) {
          suggestions.push({ term, distance: dist, count: cnt });
        }
      }
    }

    if (suggestions.length === 0) return [];

    // Sort: smallest distance first, then highest count, then shortest term.
    suggestions.sort((a, b) => {
      if (a.distance !== b.distance) return a.distance - b.distance;
      if (b.count !== a.count) return b.count - a.count;
      return a.term.length - b.term.length;
    });

    if (verbosity === Verbosity.Top) {
      return [suggestions[0]];
    }
    if (verbosity === Verbosity.Closest) {
      const minDist = suggestions[0].distance;
      return suggestions.filter(s => s.distance === minDist);
    }
    // All
    return suggestions;
  }

  /**
   * Compound / segmentation lookup.
   * Tries to correct a multi-word input or detect missing spaces (e.g. "thequick" -> "the quick").
   * Returns a single best Suggestion whose .term may contain spaces.
   */
  LookupCompound(
    input: string,
    maxEditDistance: number = this.maxDictionaryEditDistance,
  ): Suggestion | null {
    const normalized = input.toLowerCase().trim();
    if (!normalized) return null;

    const tokens = normalized.split(/\s+/).filter(Boolean);
    if (tokens.length === 0) return null;

    // Single token: delegate to normal lookup.
    if (tokens.length === 1) {
      const [top] = this.Lookup(tokens[0], Verbosity.Top, maxEditDistance);
      return top || null;
    }

    // 1) Try correcting the whole thing without spaces (common for "missing space" cases).
    const noSpace = tokens.join('');
    const joinedSuggestion = this.Lookup(noSpace, Verbosity.Top, maxEditDistance)[0];

    // 2) Correct each token independently and re-join.
    let correctedTokens: string[] = [];
    let totalDist = 0;
    let minCount = Number.MAX_SAFE_INTEGER;
    for (const tok of tokens) {
      const [sug] = this.Lookup(tok, Verbosity.Top, maxEditDistance);
      if (sug) {
        correctedTokens.push(sug.term);
        totalDist += sug.distance;
        if (sug.count < minCount) minCount = sug.count;
      } else {
        correctedTokens.push(tok);
        totalDist += 1; // small penalty for unknown
      }
    }
    const spaced = correctedTokens.join(' ');

    // 3) Try all split positions for 2-part compounds (covers many "missed space" cases better).
    let bestSplit: { term: string; distance: number; count: number } | null = null;
    for (let split = 1; split < noSpace.length; split++) {
      const left = noSpace.slice(0, split);
      const right = noSpace.slice(split);
      const leftSug = this.Lookup(left, Verbosity.Top, maxEditDistance)[0];
      const rightSug = this.Lookup(right, Verbosity.Top, maxEditDistance)[0];
      if (!leftSug || !rightSug) continue;

      const combined = `${leftSug.term} ${rightSug.term}`;
      const dist = leftSug.distance + rightSug.distance;
      const cnt = Math.min(leftSug.count, rightSug.count);

      if (
        !bestSplit ||
        dist < bestSplit.distance ||
        (dist === bestSplit.distance && cnt > bestSplit.count)
      ) {
        bestSplit = { term: combined, distance: dist, count: cnt };
      }
    }

    // Choose among options: joined, spaced independent, best split.
    const candidates: Suggestion[] = [];
    if (joinedSuggestion) {
      candidates.push(joinedSuggestion);
    }
    candidates.push({
      term: spaced,
      distance: totalDist,
      count: minCount === Number.MAX_SAFE_INTEGER ? 1 : minCount,
    });
    if (bestSplit) {
      candidates.push({
        term: bestSplit.term,
        distance: bestSplit.distance,
        count: bestSplit.count,
      });
    }

    // Prefer lower distance; break ties by higher count; prefer ones that actually inserted spaces when dist equal.
    candidates.sort((a, b) => {
      if (a.distance !== b.distance) return a.distance - b.distance;
      if (b.count !== a.count) return b.count - a.count;
      const aHasSpace = a.term.includes(' ') ? 1 : 0;
      const bHasSpace = b.term.includes(' ') ? 1 : 0;
      return bHasSpace - aHasSpace;
    });

    return candidates[0] || null;
  }

  // --- internals ---

  /** Generate the word itself + all deletes up to a given edit distance. */
  private getWithinEditDistanceDeletes(word: string, maxEd: number): Set<string> {
    const result = new Set<string>([word]);
    if (maxEd <= 0 || word.length <= 1) return result;

    const queue: string[] = [word];
    let edits = 0;

    while (queue.length > 0 && edits < maxEd) {
      edits += 1;
      const levelSize = queue.length;
      for (let i = 0; i < levelSize; i++) {
        const current = queue.shift()!;
        for (let j = 0; j < current.length; j++) {
          const deleted = current.slice(0, j) + current.slice(j + 1);
          if (!result.has(deleted)) {
            result.add(deleted);
            if (deleted.length > 1) {
              queue.push(deleted);
            }
          }
        }
      }
    }
    return result;
  }
}
