function normalizeForCheck(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

const PRONOUN_ADJ_PATTERN =
  /\b(?:you|we|they|he|she|it|i)\s+(?:available|going|coming|busy|free|ready|here|there|late|early|ok|okay|fine|good|bad|wrong|right|done|home|back|awake|asleep|online|offline)\b/i;

const BE_VERB_BEFORE_PRONOUN =
  /\b(?:are|is|am|was|were|will|won't|can't|couldn't|shouldn't|wouldn't|gonna|going to|'re|'m|'s)\s+(?:you|we|they|he|she|it|i)\b/i;

const PRONOUN_WITH_BE =
  /\b(?:you|we|they|he|she|it|i)\s+(?:are|is|am|was|were|will|'re|'m|'s)\b/i;

const REDUNDANT_TIME_PATTERN =
  /\b(?:today\s+night|tonight\s+this|this\s+day|night\s+this\s+day)\b/i;

const REPEATED_WORD_PATTERN = /\b(\w+)(?:\s+\1\b)+/i;

/** True when casual typing likely still needs a TypeLift pass. */
export function needsTypeLiftProofread(text: string): boolean {
  const trimmed = normalizeForCheck(text);
  if (!trimmed) {
    return false;
  }

  if (REPEATED_WORD_PATTERN.test(trimmed)) {
    return true;
  }

  if (REDUNDANT_TIME_PATTERN.test(trimmed)) {
    return true;
  }

  if (PRONOUN_ADJ_PATTERN.test(trimmed)) {
    const hasBeVerb =
      BE_VERB_BEFORE_PRONOUN.test(trimmed) || PRONOUN_WITH_BE.test(trimmed);
    if (!hasBeVerb) {
      return true;
    }
  }

  // Question-shaped but no question mark at end.
  if (
    /^(?:who|what|when|where|why|how|are|is|am|do|does|did|can|could|will|would|should)\b/i.test(
      trimmed,
    ) &&
    !/[?]$/.test(trimmed)
  ) {
    return true;
  }

  return false;
}

/** Fast local fixes when the model returns unchanged broken grammar. */
export function applyTypeLiftHeuristicFix(text: string): string {
  let result = normalizeForCheck(text);

  result = result.replace(/\b(\w+)(?:\s+\1\b)+/gi, '$1');
  result = result.replace(/\btoday\s+night(?:\s+this\s+day)?\b/gi, 'tonight');
  result = result.replace(/\btonight\s+this(?:\s+day)?\b/gi, 'tonight');
  result = result.replace(/\bnight\s+this\s+day\b/gi, 'tonight');

  result = result.replace(
    /\b(you)\s+(available|busy|free|ready|going|coming|here|there|ok|okay|online|offline|awake|asleep)\b/gi,
    'are you $2',
  );
  result = result.replace(
    /\b(we|they)\s+(available|busy|free|ready|going|coming|here|there|ok|okay|online|offline)\b/gi,
    'are $1 $2',
  );
  result = result.replace(
    /\b(he|she|it)\s+(available|busy|free|ready|going|coming|here|there|ok|okay|online|offline)\b/gi,
    'is $1 $2',
  );
  result = result.replace(/\bi\s+(available|busy|free|ready|going|coming|here|there)\b/gi, 'am I $1');

  result = result.replace(/\bwhats\b/gi, "what's");
  result = result.replace(/\bwheres\b/gi, "where's");
  result = result.replace(/\bhows\b/gi, "how's");
  result = result
    .split(' ')
    .map(word => {
      if (!/^[\p{L}\p{M}']+$/u.test(word)) {
        return word;
      }
      if (/^[A-Z][a-z]+$/.test(word) || /^[a-z]+$/.test(word)) {
        return word;
      }
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(' ');

  if (
    /^(?:who|what|when|where|why|how|are|is|am|do|does|did|can|could|will|would|should)\b/i.test(
      result,
    ) &&
    !/[?.!]$/.test(result)
  ) {
    result = `${result}?`;
  }

  return normalizeForCheck(result);
}
