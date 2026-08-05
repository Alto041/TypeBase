/** Cheapest generally-available Gemini model for translation. */
export const GEMINI_MODEL = 'gemini-2.5-flash-lite';

export const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

/** Slightly stronger model for short voice-dictation cleanup (strict instruction following). */
export const GEMINI_VOICE_MODEL = 'gemini-2.0-flash';

export const GEMINI_VOICE_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_VOICE_MODEL}:generateContent`;
