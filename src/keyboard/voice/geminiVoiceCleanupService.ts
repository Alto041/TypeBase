import {getGeminiApiKeyOptional} from '../settings/apiKeysStore';
import {GEMINI_API_URL} from '../translate/geminiConfig';

export class VoiceCleanupError extends Error {
  constructor(message = 'Voice cleanup failed') {
    super(message);
    this.name = 'VoiceCleanupError';
  }
}

export type VoiceCleanupResult = {
  text: string;
  detectedLanguageCode: string | null;
  /** True when a Gemini key was used to polish the transcript. */
  usedGemini: boolean;
};

type GeminiResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{text?: string}>;
    };
  }>;
  error?: {
    message?: string;
  };
};

function buildCleanupPrompt(transcript: string): string {
  return `You clean up short voice-dictation snippets from a mobile keyboard.

TASK:
- Fix capitalization and punctuation.
- Remove duplicated words, false starts, and obvious speech-to-text stutter (e.g. "Yo Yo" -> "Yo").
- Keep the same language as the input — never translate.
- Do not add new words, opinions, or commentary.
- If the input is empty or unintelligible, return {"text":"","detectedLanguageCode":null}.

OUTPUT: Return ONLY valid JSON (no markdown):
{"text":"<cleaned text>","detectedLanguageCode":"<ISO 639-1 code or null>"}

TRANSCRIPT:
${transcript}`;
}

function parseCleanupResult(
  raw: string,
): Pick<VoiceCleanupResult, 'text' | 'detectedLanguageCode'> {
  const trimmed = raw.trim();
  const jsonText = trimmed.startsWith('```')
    ? trimmed.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
    : trimmed;

  const parsed = JSON.parse(jsonText) as Partial<VoiceCleanupResult>;

  if (typeof parsed.text !== 'string') {
    throw new Error('Invalid voice cleanup response');
  }

  return {
    text: parsed.text.trim(),
    detectedLanguageCode:
      typeof parsed.detectedLanguageCode === 'string'
        ? parsed.detectedLanguageCode
        : null,
  };
}

export async function cleanupVoiceTranscript(
  transcript: string,
): Promise<VoiceCleanupResult> {
  const input = transcript.trim();
  if (!input) {
    return {text: '', detectedLanguageCode: null, usedGemini: false};
  }

  const apiKey = await getGeminiApiKeyOptional();
  if (!apiKey) {
    console.log('[VoiceCleanup/Gemini] No API key — using raw transcript:', input);
    return {text: input, detectedLanguageCode: null, usedGemini: false};
  }

  console.log('[VoiceCleanup/Gemini] Input transcript:', input);

  try {
    const response = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [{text: buildCleanupPrompt(input)}],
          },
        ],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 512,
          responseMimeType: 'application/json',
        },
      }),
    });

    const data = (await response.json()) as GeminiResponse;

    console.log('[VoiceCleanup/Gemini] Raw API response:', JSON.stringify(data));

    if (!response.ok) {
      console.warn(
        '[VoiceCleanup/Gemini] API error:',
        data.error?.message ?? response.status,
      );
      throw new VoiceCleanupError(
        data.error?.message ?? `Voice cleanup failed (${response.status})`,
      );
    }

    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    console.log('[VoiceCleanup/Gemini] Raw model text:', rawText ?? '(empty)');

    if (!rawText) {
      throw new VoiceCleanupError('Empty voice cleanup response');
    }

    const parsed = parseCleanupResult(rawText);
    const result: VoiceCleanupResult = {...parsed, usedGemini: true};
    console.log('[VoiceCleanup/Gemini] Parsed result:', result);
    return result;
  } catch (error) {
    if (error instanceof VoiceCleanupError) {
      console.warn('[VoiceCleanup/Gemini] Cleanup failed:', error.message);
      throw error;
    }
    console.warn('[VoiceCleanup/Gemini] Cleanup failed:', error);
    throw new VoiceCleanupError();
  }
}
