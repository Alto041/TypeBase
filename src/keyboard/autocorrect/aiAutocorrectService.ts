import {generateOnDeviceText} from '../ai/onDeviceTextAi';
import {GEMINI_GENERATION_CONFIG} from '../ai/generationConfig';
import {buildGemmaAutocorrectPrompt} from '../ai/gemmaPrompts';
import {getGeminiApiKeyOptional} from '../settings/apiKeysStore';
import {ensureAiProviderLoaded, getAiProvider} from '../settings/aiProviderStore';
import {GEMINI_API_URL} from '../translate/geminiConfig';

const MIN_SNIPPET_LENGTH = 8;
const MAX_SNIPPET_LENGTH = 180;
const LOG_PREFIX = '[AiAutocorrect]';

const SHORT_ACCEPTED_SNIPPETS = new Set([
  'yes',
  'no',
  'ok',
  'okay',
  'k',
  'sure',
  'thanks',
  'thank you',
  'please',
  'lol',
  'haha',
  'yeah',
  'yep',
  'nope',
  'hi',
  'hey',
  'hello',
]);

export type AiAutocorrectResult =
  | {
      kind: 'auto';
      original: string;
      correction: string;
    }
  | {
      kind: 'suggest';
      original: string;
      correction: string;
    }
  | {
      kind: 'none';
    };

type GeminiResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{text?: string}>;
    };
  }>;
};

type GeminiAutocorrectJson = {
  text?: unknown;
};

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function hasWeirdInternalCaps(word: string): boolean {
  // Only meaningful for Latin script; for others we won't flag.
  return /^[\p{L}\p{M}]+$/u.test(word) && /[a-z][A-Z]|[A-Z][a-z][A-Z]/.test(word);
}

function maxTokensForAutocorrect(input: string): number {
  // Match voice cleanup headroom — short snippets still need enough tokens for a full rewrite.
  const estimated = Math.ceil(input.length * 1.35) + 48;
  return Math.max(128, Math.min(512, estimated));
}

function buildGeminiAutocorrectPrompt(input: string): string {
  return `You fix typing mistakes in mobile keyboard text.

TASK:
- Fix every spelling error, missing apostrophe/contraction, and capitalization mistake.
- Keep slang, tone, and meaning. Do not rephrase or add new ideas.
- If the text is already correct, return it unchanged.

OUTPUT: Return ONLY valid JSON (no markdown):
{"text":"<corrected text>"}

TEXT:
${input}`;
}

/** Same plain-text parsing voice polish uses for on-device Gemma. */
function parseOnDeviceAutocorrectResult(raw: string): string {
  const trimmed = raw.trim();
  const unquoted =
    trimmed.startsWith('"') && trimmed.endsWith('"') && trimmed.length >= 2
      ? trimmed.slice(1, -1)
      : trimmed;
  return normalizeWhitespace(unquoted);
}

function parseGeminiAutocorrectResult(raw: string): string {
  const trimmed = raw.trim();
  const jsonText = trimmed.startsWith('```')
    ? trimmed.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '')
    : trimmed;

  try {
    const parsed = JSON.parse(jsonText) as GeminiAutocorrectJson;
    if (typeof parsed.text === 'string') {
      return normalizeWhitespace(parsed.text);
    }
  } catch {
    // Gemini occasionally returns plain text despite JSON hints — same fallback as rewrite.
  }

  return parseOnDeviceAutocorrectResult(jsonText);
}

function lastProofreadSnippet(context: string): string | null {
  const trimmed = context.replace(/\s+$/, '');
  if (trimmed.length < MIN_SNIPPET_LENGTH && !hasWeirdInternalCaps(trimmed)) {
    console.log(LOG_PREFIX, 'skip: context too short', {length: trimmed.length});
    return null;
  }

  const boundary = Math.max(
    trimmed.lastIndexOf('\n'),
    trimmed.lastIndexOf('. '),
    trimmed.lastIndexOf('! '),
    trimmed.lastIndexOf('? '),
  );
  const rawSnippet =
    boundary >= 0 ? trimmed.slice(boundary + (trimmed[boundary] === '\n' ? 1 : 2)) : trimmed;
  const snippet = rawSnippet.slice(-MAX_SNIPPET_LENGTH).trim();
  if (snippet.length < MIN_SNIPPET_LENGTH && !hasWeirdInternalCaps(snippet)) {
    console.log(LOG_PREFIX, 'skip: snippet too short', {snippet, length: snippet.length});
    return null;
  }
  if (SHORT_ACCEPTED_SNIPPETS.has(snippet.toLowerCase())) {
    console.log(LOG_PREFIX, 'skip: short accepted snippet', {snippet});
    return null;
  }
  if (!/[\p{L}]/.test(snippet)) {
    console.log(LOG_PREFIX, 'skip: no letters in snippet', {snippet});
    return null;
  }
  console.log(LOG_PREFIX, 'snippet selected', {snippet});
  return snippet;
}

function levenshtein(a: string, b: string): number {
  const prev = Array.from({length: b.length + 1}, (_, index) => index);
  const curr = new Array<number>(b.length + 1);

  for (let i = 1; i <= a.length; i += 1) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= b.length; j += 1) {
      prev[j] = curr[j];
    }
  }

  return prev[b.length];
}

function classifyCorrection(
  original: string,
  correction: string,
): AiAutocorrectResult {
  const normalizedOriginal = normalizeWhitespace(original);
  const normalizedCorrection = normalizeWhitespace(correction);

  if (!normalizedCorrection || normalizedCorrection === normalizedOriginal) {
    console.log(LOG_PREFIX, 'reject: unchanged', {original: normalizedOriginal});
    return {kind: 'none'};
  }

  // Block wild rewrites — autocorrect should stay close to what was typed.
  if (
    normalizedCorrection.length > normalizedOriginal.length + 40 ||
    normalizedCorrection.length < Math.max(2, normalizedOriginal.length - 20)
  ) {
    console.log(LOG_PREFIX, 'reject: length gate', {
      original: normalizedOriginal,
      correction: normalizedCorrection,
    });
    return {kind: 'none'};
  }

  const wordDelta = Math.abs(
    normalizedCorrection.split(/\s+/).length - normalizedOriginal.split(/\s+/).length,
  );
  const distance = levenshtein(
    normalizedOriginal.toLowerCase(),
    normalizedCorrection.toLowerCase(),
  );

  // Generous limit — multiple typos in one sentence are expected.
  const autoDistanceLimit = Math.min(72, Math.max(20, Math.ceil(normalizedOriginal.length * 0.55)));

  if (wordDelta > 4 || distance > autoDistanceLimit + 12) {
    console.log(LOG_PREFIX, 'reject: diff too large', {
      original: normalizedOriginal,
      correction: normalizedCorrection,
      distance,
      wordDelta,
      autoDistanceLimit,
    });
    return {kind: 'none'};
  }

  if (distance <= autoDistanceLimit && wordDelta <= 2) {
    console.log(LOG_PREFIX, 'auto result', {
      original: normalizedOriginal,
      correction: normalizedCorrection,
      distance,
      wordDelta,
      autoDistanceLimit,
    });
    return {
      kind: 'auto',
      original,
      correction: normalizedCorrection,
    };
  }

  console.log(LOG_PREFIX, 'suggestion result', {
    original: normalizedOriginal,
    correction: normalizedCorrection,
    distance,
    wordDelta,
  });
  return {
    kind: 'suggest',
    original,
    correction: normalizedCorrection,
  };
}

async function generateGeminiProofread(input: string): Promise<string | null> {
  const apiKey = await getGeminiApiKeyOptional();
  if (!apiKey) {
    console.log(LOG_PREFIX, 'skip: missing Gemini API key');
    return null;
  }

  console.log(LOG_PREFIX, 'Gemini request', {input});
  const response = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      contents: [
        {
          role: 'user',
          parts: [{text: buildGeminiAutocorrectPrompt(input)}],
        },
      ],
      generationConfig: {
        ...GEMINI_GENERATION_CONFIG,
        temperature: 0,
        topP: 1,
        maxOutputTokens: maxTokensForAutocorrect(input),
        responseMimeType: 'application/json',
      },
    }),
  });

  if (!response.ok) {
    console.log(LOG_PREFIX, 'Gemini error', {status: response.status});
    return null;
  }

  const data = (await response.json()) as GeminiResponse;
  const raw = data.candidates?.[0]?.content?.parts?.[0]?.text ?? null;
  console.log(LOG_PREFIX, 'Gemini raw response', {raw});
  return raw;
}

async function generateProofread(input: string): Promise<string | null> {
  await ensureAiProviderLoaded();
  if (getAiProvider() === 'on_device') {
    console.log(LOG_PREFIX, 'on-device request', {input});
    const raw = await generateOnDeviceText(buildGemmaAutocorrectPrompt(input));
    console.log(LOG_PREFIX, 'on-device raw response', {raw});
    return parseOnDeviceAutocorrectResult(raw);
  }

  const raw = await generateGeminiProofread(input);
  if (!raw) {
    return null;
  }
  return parseGeminiAutocorrectResult(raw);
}

export async function proofreadRecentTypingContext(
  context: string,
): Promise<AiAutocorrectResult> {
  const original = lastProofreadSnippet(context);
  if (!original) {
    return {kind: 'none'};
  }

  try {
    const correction = await generateProofread(original);

    console.log(LOG_PREFIX, 'parsed correction', {
      original,
      correction,
    });

    if (!correction) {
      return {kind: 'none'};
    }

    return classifyCorrection(original, correction);
  } catch (error) {
    console.log(LOG_PREFIX, 'proofread failed', {
      message: error instanceof Error ? error.message : String(error),
    });
    return {kind: 'none'};
  }
}
