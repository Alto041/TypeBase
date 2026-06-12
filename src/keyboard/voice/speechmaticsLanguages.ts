/**
 * Languages to try for Speechmatics realtime, in priority order.
 * `auto` uses Language Identification where the account supports it (batch-first;
 * realtime may fall back to the next code).
 *
 * @see https://docs.speechmatics.com/speech-to-text/languages
 */
export const SPEECHMATICS_LANGUAGE_TRY_ORDER = ['auto', 'en'] as const;

export type SpeechmaticsLanguageCode =
  (typeof SPEECHMATICS_LANGUAGE_TRY_ORDER)[number];
