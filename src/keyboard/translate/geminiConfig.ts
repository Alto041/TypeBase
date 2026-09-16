/** Cost-efficient Gemini 3 workhorse for translate, rewrite, format, and autocorrect. */
export const GEMINI_MODEL = 'gemini-3.1-flash-lite';

export const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

/** Flash-tier Gemini 3 for short voice-dictation cleanup (strict instruction following). */
export const GEMINI_VOICE_MODEL = 'gemini-3-flash-preview';

export const GEMINI_VOICE_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_VOICE_MODEL}:generateContent`;
