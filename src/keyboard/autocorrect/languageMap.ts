import type { LetterLayoutId } from '../layouts/letterLayouts';
import { isCustomLayoutId } from '../layouts/letterLayouts';
import { getLetterLayoutMeta } from '../layouts/resolveLetterLayout';

export type Script = 'latin' | 'cyrillic' | 'arabic' | 'other';

export type ScriptProfile = {
  lang: string;
  script: Script;
};

/**
 * Maps a keyboard layout ID to a canonical language identifier for autocorrect dictionaries.
 * This enables automatic language selection without a manual picker.
 * Multiple layouts for the same language (e.g. en-us / en-gb) share the same dictionary key.
 */
export function getAutocorrectLanguage(layoutId: LetterLayoutId): string {
  if (isCustomLayoutId(layoutId)) {
    // Custom KLC layouts default to English dictionary (or a future user-associable default).
    return 'en';
  }

  const meta = getLetterLayoutMeta(layoutId);
  const id = layoutId as string;

  // Explicit specials for non-latin first
  if (id === 'ru-ru') return 'ru';
  if (id === 'ar-sa') return 'ar';

  // Map known layouts to their language code.
  // When real per-language frequency data is added, these will select the correct dictionary.
  switch (id) {
    case 'en-us':
    case 'en-gb':
      return 'en';
    case 'hi-en':
      return 'hi-en';
    case 'fr-fr':
      return 'fr-en';
    case 'de-de':
      return 'de';
    case 'es-es':
      return 'es';
    case 'it-it':
      return 'it';
    case 'pt-pt':
      return 'pt';
    case 'pl-pl':
      return 'pl';
    case 'tr-tr':
      return 'tr';
    case 'nl-nl':
      return 'nl';
    case 'sv-se':
      return 'sv';
    case 'da-dk':
      return 'da';
    case 'nb-no':
      return 'nb';
    default:
      // Fallback: derive from meta.language lowercased first token or family.
      if (meta.family === 'Cyrillic') return 'ru';
      if (meta.family === 'Arabic') return 'ar';
      // For any future latin KLC or unknown, use 'en' seed for now.
      return 'en';
  }
}

/** Returns true for layouts whose primary script is Latin (including extended with diacritics). */
export function isLatinScriptLayout(layoutId: LetterLayoutId): boolean {
  const profile = getScriptProfile(layoutId);
  return profile.script === 'latin';
}

export function getScriptProfile(layoutId: LetterLayoutId): ScriptProfile {
  const lang = getAutocorrectLanguage(layoutId);
  if (lang === 'ru') {
    return { lang, script: 'cyrillic' };
  }
  if (lang === 'ar') {
    return { lang, script: 'arabic' };
  }
  // Everything else we treat as latin for tokenization purposes (even if some customs are exotic).
  return { lang, script: 'latin' };
}

/** Returns a unicode-aware regex fragment for matching "letters" in words for the script. */
export function getWordCharClass(layoutId: LetterLayoutId): string {
  const profile = getScriptProfile(layoutId);
  switch (profile.script) {
    case 'latin':
      // Latin letters + marks (accents, combining) + apostrophe for contractions.
      return "\\p{L}\\p{M}'";
    case 'cyrillic':
      return '\\p{L}\\p{M}';
    case 'arabic':
      return '\\p{L}\\p{M}';
    default:
      return "\\p{L}\\p{M}'";
  }
}
