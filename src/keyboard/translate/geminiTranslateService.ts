import {GEMINI_API_KEY, GEMINI_API_URL} from './geminiConfig';

export type TranslateResult = {
  detectedLanguage: string;
  detectedLanguageCode: string;
  translation: string;
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

function buildTranslatePrompt(text: string, targetLanguage: string): string {
  return `You are a professional translator built into a mobile keyboard. Your only job is to translate text accurately and naturally.

TASK:
- Auto-detect the source language of the input text.
- Translate the text into ${targetLanguage}.
- Return ONLY a single JSON object — no markdown, no code fences, no explanation.

RULES:
- Preserve line breaks, bullet points, numbers, emoji, URLs, email addresses, and @handles as appropriate.
- Keep proper nouns, brand names, and technical terms unchanged unless a well-known localized form exists.
- Match the tone: casual stays casual, formal stays formal.
- If the text is already in ${targetLanguage}, return it unchanged.
- If the input is empty, whitespace-only, or not human language, set translation to "" and detectedLanguage to "Unknown".

OUTPUT SCHEMA (strict):
{"detectedLanguage":"<language name in English>","detectedLanguageCode":"<ISO 639-1 code>","translation":"<translated text>"}

TARGET LANGUAGE: ${targetLanguage}

TEXT:
${text}`;
}

function parseTranslateResult(raw: string): TranslateResult {
  const trimmed = raw.trim();
  const jsonText = trimmed.startsWith('```')
    ? trimmed.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
    : trimmed;

  const parsed = JSON.parse(jsonText) as Partial<TranslateResult>;

  if (typeof parsed.translation !== 'string') {
    throw new Error('Invalid translation response');
  }

  return {
    detectedLanguage:
      typeof parsed.detectedLanguage === 'string'
        ? parsed.detectedLanguage
        : 'Unknown',
    detectedLanguageCode:
      typeof parsed.detectedLanguageCode === 'string'
        ? parsed.detectedLanguageCode
        : 'und',
    translation: parsed.translation,
  };
}

export async function translateText(
  text: string,
  targetLanguage: string,
): Promise<TranslateResult> {
  const input = text.trim();
  if (!input) {
    return {
      detectedLanguage: 'Unknown',
      detectedLanguageCode: 'und',
      translation: '',
    };
  }

  const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      contents: [
        {
          role: 'user',
          parts: [{text: buildTranslatePrompt(input, targetLanguage)}],
        },
      ],
      generationConfig: {
        temperature: 0.15,
        maxOutputTokens: 2048,
        responseMimeType: 'application/json',
      },
    }),
  });

  const data = (await response.json()) as GeminiResponse;

  if (!response.ok) {
    throw new Error(data.error?.message ?? `Translation failed (${response.status})`);
  }

  const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!rawText) {
    throw new Error('Empty translation response');
  }

  return parseTranslateResult(rawText);
}
