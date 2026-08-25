import {isGemmaModelDownloaded, isGemmaNativeAvailable} from '../ai/gemmaBridge';
import {getGeminiApiKeyOptional} from '../settings/apiKeysStore';
import {ensureAiProviderLoaded, getAiProvider} from '../settings/aiProviderStore';
import {buildGemmaParakeetCleanupPrompt, buildGemmaVoiceCleanupPrompt} from '../ai/gemmaPrompts';
import {generateOnDeviceText} from '../ai/onDeviceTextAi';
import {GEMINI_GENERATION_CONFIG} from '../ai/generationConfig';
import {GEMINI_VOICE_API_URL} from '../translate/geminiConfig';
import {
  applyVoiceHeuristicCleanup,
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

export type VoiceCleanupOptions = {
  /** Prefer on-device Gemma when the model is available (e.g. Parakeet STT). */
  preferOnDevice?: boolean;
  /** Allow shorter cleaned text when fillers were removed (Parakeet STT). */
  allowFillerRemoval?: boolean;
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
- Remove speech fillers that add no meaning (um, uh, hmm, er, ah, mhm, and similar).
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
  let trimmed = raw
    .trim()
    .replace(/<end_of_turn>/gi, '')
    .replace(/<start_of_turn>\w*/gi, '')
    .trim();
  const unquoted =
    trimmed.startsWith('"') && trimmed.endsWith('"') && trimmed.length >= 2
      ? trimmed.slice(1, -1)
      : trimmed;

  const quotedMatch = unquoted.match(/"([^"]{3,})"/);
  if (quotedMatch) {
    return {text: quotedMatch[1].trim(), detectedLanguageCode: null};
  }

  return {text: unquoted.trim(), detectedLanguageCode: null};
}

function shouldApplyVoiceHeuristics(
  options: VoiceCleanupOptions | undefined,
  aiProvider: ReturnType<typeof getAiProvider>,
): boolean {
  return Boolean(
    options?.allowFillerRemoval ||
      options?.preferOnDevice ||
      aiProvider === 'on_device',
  );
}

function shouldTryOnDeviceGemma(
  options: VoiceCleanupOptions | undefined,
  aiProvider: ReturnType<typeof getAiProvider>,
): boolean {
  return Boolean(options?.preferOnDevice || aiProvider === 'on_device');
}

async function canUseOnDeviceGemma(): Promise<boolean> {
  return isGemmaNativeAvailable() && (await isGemmaModelDownloaded());
}

async function polishWithOnDeviceGemma(
  input: string,
  options?: VoiceCleanupOptions,
): Promise<string> {
  const prompt = options?.allowFillerRemoval
    ? buildGemmaParakeetCleanupPrompt(input)
    : buildGemmaVoiceCleanupPrompt(input);
  const raw = await generateOnDeviceText(prompt);
  const parsed = parseOnDeviceCleanupResult(raw);
  return resolveVoiceCleanupText(input, parsed.text, {
    allowFillerRemoval: options?.allowFillerRemoval,
  });
}

export async function cleanupVoiceTranscript(
  transcript: string,
  options?: VoiceCleanupOptions,
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
  const aiProvider = getAiProvider();
  const fillerOptions = {
    ...options,
    allowFillerRemoval: options?.allowFillerRemoval ?? true,
  };
  const useHeuristics = shouldApplyVoiceHeuristics(fillerOptions, aiProvider);
  const workingText = useHeuristics
    ? applyVoiceHeuristicCleanup(input)
    : input;
  const heuristicChanged = workingText !== input;
  const isParakeet = Boolean(fillerOptions.preferOnDevice);

  if (isParakeet) {
    if (await canUseOnDeviceGemma()) {
      try {
        const gemmaText = await polishWithOnDeviceGemma(workingText, fillerOptions);
        console.log('[VoiceCleanup]', {
          stage: 'parakeet+gemma',
          input,
          heuristic: heuristicChanged ? workingText : undefined,
          output: gemmaText,
        });
        return {
          text: gemmaText,
          detectedLanguageCode: null,
          usedGemini: false,
          usedOnDeviceAi: true,
        };
      } catch (error) {
        console.warn('[VoiceCleanup] Parakeet Gemma pass failed:', error);
        if (!(error instanceof VoiceCleanupError)) {
          throw error;
        }
      }
    }

    console.log('[VoiceCleanup]', {
      stage: 'parakeet-heuristic',
      input,
      output: workingText,
    });
    return {
      text: workingText,
      detectedLanguageCode: null,
      usedGemini: false,
      usedOnDeviceAi: false,
    };
  }

  // Non-parakeet: heuristics alone are enough when they already fixed fillers.
  if (heuristicChanged) {
    console.log('[VoiceCleanup]', {
      stage: 'heuristic',
      input,
      output: workingText,
    });
    return {
      text: workingText,
      detectedLanguageCode: null,
      usedGemini: false,
      usedOnDeviceAi: false,
    };
  }

  if (
    shouldTryOnDeviceGemma(fillerOptions, aiProvider) &&
    (await canUseOnDeviceGemma())
  ) {
    try {
      const gemmaText = await polishWithOnDeviceGemma(workingText, fillerOptions);
      const usedOnDeviceAi = gemmaText !== workingText;
      console.log('[VoiceCleanup]', {
        stage: 'gemma',
        input: workingText,
        output: gemmaText,
        usedOnDeviceAi,
      });
      return {
        text: gemmaText,
        detectedLanguageCode: null,
        usedGemini: false,
        usedOnDeviceAi,
      };
    } catch (error) {
      console.warn('[VoiceCleanup] On-device Gemma failed:', error);
      if (!(error instanceof VoiceCleanupError)) {
        throw error;
      }
    }
  }

  const apiKey = await getGeminiApiKeyOptional();
  if (!apiKey) {
    return {
      text: workingText,
      detectedLanguageCode: null,
      usedGemini: false,
      usedOnDeviceAi: false,
    };
  }

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
            parts: [{text: buildCleanupPrompt(workingText)}],
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

    if (!response.ok) {
      throw new VoiceCleanupError(
        data.error?.message ?? `Voice cleanup failed (${response.status})`,
      );
    }

    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawText) {
      throw new VoiceCleanupError('Empty voice cleanup response');
    }

    const parsed = parseCleanupResult(rawText);
    const text = resolveVoiceCleanupText(workingText, parsed.text, {
      allowFillerRemoval: fillerOptions.allowFillerRemoval,
    });
    if (!isFaithfulVoiceCleanup(workingText, parsed.text)) {
      console.warn('[VoiceCleanup] Cloud Gemini over-edited, keeping working text');
    }
    const usedGemini = text !== workingText;
    console.log('[VoiceCleanup]', {
      stage: 'cloud',
      input: workingText,
      output: text,
      usedGemini,
    });
    return {
      text,
      detectedLanguageCode: parsed.detectedLanguageCode,
      usedGemini,
      usedOnDeviceAi: false,
    };
  } catch (error) {
    if (error instanceof VoiceCleanupError) {
      throw error;
    }
    throw new VoiceCleanupError();
  }
}
