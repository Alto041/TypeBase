import {getGeminiApiKeyOptional} from '../settings/apiKeysStore';
import {ensureAiProviderLoaded, getAiProvider} from '../settings/aiProviderStore';
import {buildGemmaVoiceCleanupPrompt} from '../ai/gemmaPrompts';
import {generateOnDeviceText} from '../ai/onDeviceTextAi';
import {GEMINI_GENERATION_CONFIG} from '../ai/generationConfig';
import {GEMINI_VOICE_API_URL} from '../translate/geminiConfig';
import {
  isFaithfulVoiceCleanup,
  resolveVoiceCleanupText,
} from './voiceCleanupUtils';

export class VoiceCleanupError extends Error {
  constructor(message = 'Voice cleanup failed') {
    super(message);
    this.name = 'VoiceCleanupError';
  }
}

export type VoiceCleanupResult = {
  text: string;
  detectedLanguageCode: string | null;
  /** True when cloud Gemini polished the transcript. */
  usedGemini: boolean;
  /** True when on-device Gemma polished the transcript. */
  usedOnDeviceAi: boolean;
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
  return `You clean up raw speech-to-text from a mobile keyboard.

STRICT RULES:
- Preserve meaning and wording. Do NOT rephrase, summarize, expand, or "improve" the message.
- Only fix capitalization, ending punctuation, and obvious STT stutter/duplicates (e.g. "I I think" -> "I think").
- Keep slang, names, numbers, emoji, and mixed-language text exactly as spoken.
- Never translate or switch languages.
- If the input is already fine, return it almost unchanged.
- If empty or unintelligible, return {"text":"","detectedLanguageCode":null}.

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

function parseOnDeviceCleanupResult(
  raw: string,
): Pick<VoiceCleanupResult, 'text' | 'detectedLanguageCode'> {
  const trimmed = raw.trim();
  const unquoted =
    trimmed.startsWith('"') && trimmed.endsWith('"') && trimmed.length >= 2
      ? trimmed.slice(1, -1)
      : trimmed;
  return {text: unquoted.trim(), detectedLanguageCode: null};
}

export async function cleanupVoiceTranscript(
  transcript: string,
): Promise<VoiceCleanupResult> {
  const input = transcript.trim();
  if (!input) {
    return {
      text: '',
      detectedLanguageCode: null,
      usedGemini: false,
      usedOnDeviceAi: false,
    };
  }

  await ensureAiProviderLoaded();
  if (getAiProvider() === 'on_device') {
    console.log('[VoiceCleanup/OnDevice] Input transcript:', input);
    try {
      const raw = await generateOnDeviceText(buildGemmaVoiceCleanupPrompt(input));
      const parsed = parseOnDeviceCleanupResult(raw);
      const text = resolveVoiceCleanupText(input, parsed.text);
      const result: VoiceCleanupResult = {
        text,
        detectedLanguageCode: parsed.detectedLanguageCode,
        usedGemini: false,
        usedOnDeviceAi: text !== input.trim(),
      };
      console.log('[VoiceCleanup/OnDevice] Parsed result:', result);
      return result;
    } catch (error) {
      console.warn('[VoiceCleanup/OnDevice] Cleanup failed:', error);
      throw new VoiceCleanupError(
        error instanceof Error ? error.message : undefined,
      );
    }
  }

  const apiKey = await getGeminiApiKeyOptional();
  if (!apiKey) {
    console.log('[VoiceCleanup/Gemini] No API key — using raw transcript:', input);
    return {
      text: input,
      detectedLanguageCode: null,
      usedGemini: false,
      usedOnDeviceAi: false,
    };
  }

  console.log('[VoiceCleanup/Gemini] Input transcript:', input);

  try {
    const response = await fetch(`${GEMINI_VOICE_API_URL}?key=${apiKey}`, {
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
          ...GEMINI_GENERATION_CONFIG,
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
    const text = resolveVoiceCleanupText(input, parsed.text);
    if (!isFaithfulVoiceCleanup(input, parsed.text)) {
      console.warn(
        '[VoiceCleanup/Gemini] Rejected over-edited result, using raw transcript',
      );
    }
    const result: VoiceCleanupResult = {
      text,
      detectedLanguageCode: parsed.detectedLanguageCode,
      usedGemini: text !== input.trim(),
      usedOnDeviceAi: false,
    };
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
