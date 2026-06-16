import {requireGeminiApiKey} from '../settings/apiKeysStore';
import {
  ensureAiProviderLoaded,
  getAiProvider,
  type AiProvider,
} from '../settings/aiProviderStore';
import {GEMINI_GENERATION_CONFIG} from './generationConfig';
import {GEMINI_API_URL} from '../translate/geminiConfig';
import {wrapGemmaPrompt} from './gemmaPrompts';
import {generateOnDeviceText} from './onDeviceTextAi';

export type AiDebugResult = {
  provider: AiProvider;
  output: string;
  elapsedMs: number;
  promptSent: string;
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

async function generateGeminiText(prompt: string): Promise<string> {
  const apiKey = await requireGeminiApiKey();
  const response = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      contents: [
        {
          role: 'user',
          parts: [{text: prompt}],
        },
      ],
      generationConfig: {
        ...GEMINI_GENERATION_CONFIG,
        maxOutputTokens: 2048,
      },
    }),
  });

  const data = (await response.json()) as GeminiResponse;

  if (!response.ok) {
    throw new Error(data.error?.message ?? `Gemini failed (${response.status})`);
  }

  const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!rawText) {
    throw new Error('Empty Gemini response');
  }

  return rawText.trim();
}

export async function runAiDebugPrompt(
  prompt: string,
  options?: {wrapGemma?: boolean; onStatus?: (status: string) => void},
): Promise<AiDebugResult> {
  const input = prompt.trim();
  if (!input) {
    throw new Error('Enter a prompt first.');
  }

  await ensureAiProviderLoaded();
  const provider = getAiProvider();
  const wrapGemma = options?.wrapGemma ?? provider === 'on_device';
  const promptSent = wrapGemma ? wrapGemmaPrompt(input) : input;

  const started = Date.now();
  let output = '';
  if (provider === 'on_device') {
    options?.onStatus?.('Loading on-device model (first run can take 10–30s)…');
    output = await generateOnDeviceText(promptSent);
  } else {
    options?.onStatus?.('Calling Gemini…');
    output = await generateGeminiText(promptSent);
  }

  return {
    provider,
    output,
    elapsedMs: Date.now() - started,
    promptSent,
  };
}
