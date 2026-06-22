import {requireGeminiApiKey} from '../settings/apiKeysStore';
import {ensureAiProviderLoaded, getAiProvider} from '../settings/aiProviderStore';
import {buildGemmaFormatFollowUpPrompt, buildGemmaFormatPrompt} from '../ai/gemmaPrompts';
import {extractJsonPayload, generateOnDeviceText} from '../ai/onDeviceTextAi';
import {GEMINI_GENERATION_CONFIG} from '../ai/generationConfig';
import {GEMINI_API_URL} from '../translate/geminiConfig';
import type {FormatSession} from './formatSessionStore';
import {getFormatType} from './formatTypes';

export type FormatResult = {
  formatted: string;
};

type GeminiContent = {
  role: 'user' | 'model';
  parts: Array<{text: string}>;
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

function buildFormatPrompt(sourceText: string, formatId: string): string {
  const format = getFormatType(formatId);
  return `You are a formatting assistant built into a mobile keyboard. The user already has the content — your job is to structure it for sending, not to invent new ideas.

FORMAT:
${format.instruction}

RULES:
- Keep the same language as the input — never translate.
- Preserve names, numbers, dates, URLs, email addresses, and @handles.
- Remove AI filler ("Certainly!", "Here's a draft:", markdown code fences, **bold** markers).
- Do not add commentary about what you changed.
- If the input is empty, return {"formatted":""}.
- Return ONLY valid JSON — no markdown, no code fences.

OUTPUT SCHEMA (strict):
{"formatted":"<formatted text>"}

SOURCE TEXT:
${sourceText}`;
}

function buildFollowUpPrompt(currentText: string, followUpInstruction: string): string {
  return `You are a formatting assistant built into a mobile keyboard. Refine the formatted text below.

CHANGE:
${followUpInstruction}

RULES:
- Keep the same language as the input — never translate.
- Preserve names, numbers, dates, URLs, email addresses, and @handles.
- Apply only the requested change.
- Return ONLY valid JSON — no markdown, no code fences.

OUTPUT SCHEMA (strict):
{"formatted":"<formatted text>"}

TEXT:
${currentText}`;
}

function parseFormatResult(raw: string): FormatResult {
  const trimmed = raw.trim();
  const jsonText = trimmed.startsWith('```')
    ? trimmed.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
    : trimmed;

  try {
    const parsed = JSON.parse(jsonText) as Partial<FormatResult>;
    if (typeof parsed.formatted !== 'string') {
      throw new Error('Invalid format response');
    }
    return {formatted: parsed.formatted};
  } catch {
    return parsePlainFormatResult(jsonText);
  }
}

function parsePlainFormatResult(raw: string): FormatResult {
  const trimmed = raw.trim();
  const unquoted =
    trimmed.startsWith('"') && trimmed.endsWith('"') && trimmed.length >= 2
      ? trimmed.slice(1, -1)
      : trimmed;
  return {formatted: unquoted.trim()};
}

function parseOnDeviceFormatResult(raw: string): FormatResult {
  try {
    return parseFormatResult(extractJsonPayload(raw));
  } catch {
    return parsePlainFormatResult(raw);
  }
}

function buildGeminiContents(
  prompt: string,
  session: FormatSession | null,
): GeminiContent[] {
  if (!session || session.turns.length === 0) {
    return [{role: 'user', parts: [{text: prompt}]}];
  }

  const contents: GeminiContent[] = [
    {
      role: 'user',
      parts: [
        {
          text: buildFormatPrompt(session.sourceText, session.formatId),
        },
      ],
    },
  ];

  for (const turn of session.turns) {
    contents.push({
      role: turn.role,
      parts: [{text: turn.text}],
    });
  }

  contents.push({role: 'user', parts: [{text: prompt}]});
  return contents;
}

export async function formatText(options: {
  sourceText: string;
  formatId: string;
  session?: FormatSession | null;
  followUpInstruction?: string;
  currentOutput?: string;
}): Promise<FormatResult> {
  const source = options.sourceText.trim();
  const currentOutput = options.currentOutput?.trim() ?? '';

  if (options.followUpInstruction) {
    if (!currentOutput) {
      return {formatted: ''};
    }
    const prompt = buildFollowUpPrompt(
      currentOutput,
      options.followUpInstruction,
    );

    await ensureAiProviderLoaded();
    if (getAiProvider() === 'on_device') {
      const raw = await generateOnDeviceText(
        buildGemmaFormatFollowUpPrompt(
          currentOutput,
          options.followUpInstruction,
          options.session,
        ),
      );
      return parseOnDeviceFormatResult(raw);
    }

    const apiKey = await requireGeminiApiKey();
    const response = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: buildGeminiContents(prompt, options.session ?? null),
        generationConfig: {
          ...GEMINI_GENERATION_CONFIG,
          maxOutputTokens: 2048,
          responseMimeType: 'application/json',
        },
      }),
    });

    const data = (await response.json()) as GeminiResponse;
    if (!response.ok) {
      throw new Error(data.error?.message ?? `Format failed (${response.status})`);
    }

    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawText) {
      throw new Error('Empty format response');
    }
    return parseFormatResult(rawText);
  }

  if (!source) {
    return {formatted: ''};
  }

  const prompt = buildFormatPrompt(source, options.formatId);

  await ensureAiProviderLoaded();
  if (getAiProvider() === 'on_device') {
    const raw = await generateOnDeviceText(
      buildGemmaFormatPrompt(source, options.formatId),
    );
    return parseOnDeviceFormatResult(raw);
  }

  const apiKey = await requireGeminiApiKey();
  const response = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      contents: [{role: 'user', parts: [{text: prompt}]}],
      generationConfig: {
        ...GEMINI_GENERATION_CONFIG,
        maxOutputTokens: 2048,
        responseMimeType: 'application/json',
      },
    }),
  });

  const data = (await response.json()) as GeminiResponse;
  if (!response.ok) {
    throw new Error(data.error?.message ?? `Format failed (${response.status})`);
  }

  const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!rawText) {
    throw new Error('Empty format response');
  }

  return parseFormatResult(rawText);
}
