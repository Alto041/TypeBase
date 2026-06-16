/** Shared deterministic generation settings for cloud Gemini calls. */
export const GEMINI_GENERATION_CONFIG = {
  temperature: 0,
  topP: 1,
  topK: 40,
  frequencyPenalty: 0,
  presencePenalty: 0,
} as const;