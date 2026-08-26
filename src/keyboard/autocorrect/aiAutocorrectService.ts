import {generateOnDeviceText} from '../ai/onDeviceTextAi';
import {GEMINI_GENERATION_CONFIG} from '../ai/generationConfig';
import {buildGemmaAutocorrectPrompt, buildGemmaAutocorrectStrongPrompt} from '../ai/gemmaPrompts';
import {shouldAutoCapitalize} from '../autoCapitalize';
import {
  applyTypeLiftHeuristicFix,
  needsTypeLiftProofread,
} from './typeLiftHeuristics';
import {
  cleanOnDeviceTypeLiftOutput,
  isDegenerateTypeLiftOutput,
  isFaithfulTypeLiftCorrection,
} from './typeLiftFaithfulness';
import {getGeminiApiKeyOptional} from '../settings/apiKeysStore';
import {ensureAiProviderLoaded, getAiProvider} from '../settings/aiProviderStore';
import {GEMINI_API_URL} from '../translate/geminiConfig';

const MIN_SNIPPET_LENGTH = 8;
const MAX_SNIPPET_LENGTH = 180;
const MIN_TOKEN_LENGTH = 4;
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

function stripWrappingQuotes(text: string): string {
  let trimmed = text.trim();
  while (trimmed.length >= 2) {
    const first = trimmed[0];
    const last = trimmed[trimmed.length - 1];
    const wrapped =
      (first === '"' && last === '"') ||
      (first === "'" && last === "'") ||
      (first === '\u201c' && last === '\u201d') ||
      (first === '\u2018' && last === '\u2019');
    if (!wrapped) {
      break;
    }
    trimmed = trimmed.slice(1, -1).trim();
  }
  return trimmed
    .replace(/^["'`\u201c\u201d\u2018\u2019]+|[\u201c\u201d\u2018\u2019"'`]+$/g, '')
    .replace(/([.!?])["'`\u201c\u201d\u2018\u2019]+\s*$/g, '$1')
    .trim();
}

function sanitizeTypeLiftCorrection(text: string): string {
  return stripWrappingQuotes(
    text
      .replace(/\\[nr]/g, ' ')
      .replace(/[\r\n]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim(),
  );
}

function normalizeWhitespace(text: string): string {
  return sanitizeTypeLiftCorrection(text);
}

function hasMessyWordCasing(word: string): boolean {
  if (word.length <= 1) {
    return false;
  }
  return /[a-z]/.test(word) && /[A-Z]/.test(word.slice(1));
}

/** Strip model quotes and fix pathological mixed-case output from auto-cap + AI. */
export function finalizeTypeLiftCorrection(
  contextBefore: string,
  original: string,
  correction: string,
): string {
  const sanitized = sanitizeTypeLiftCorrection(correction);
  if (!sanitized) {
    return sanitized;
  }

  const originalWords = original.trim().split(/\s+/).filter(Boolean);
  const correctionWords = sanitized.split(/\s+/).filter(Boolean);

  if (originalWords.length === 1 && correctionWords.length === 1) {
    const source = originalWords[0]!;
    const target = correctionWords[0]!;
    if (source === source.toUpperCase()) {
      return target.toUpperCase();
    }
    if (source === source.toLowerCase()) {
      return target.toLowerCase();
    }
    if (/^[A-Z][a-z]+$/.test(source)) {
      return target.charAt(0).toUpperCase() + target.slice(1).toLowerCase();
    }
    return target;
  }

  const hasMessyCaps =
    correctionWords.some(hasMessyWordCasing) ||
    /["'`\u201c\u201d\u2018\u2019]/.test(sanitized);

  if (!hasMessyCaps) {
    return sanitized;
  }

  const lowerWords = correctionWords.map(word => word.toLowerCase());
  const prefix = contextBefore.replace(/\s+$/, '');
  const sentenceStart =
    prefix.length > 0
      ? shouldAutoCapitalize(prefix)
      : /^[A-Z]/.test(original.trim());
  if (sentenceStart && lowerWords.length > 0 && lowerWords[0]) {
    lowerWords[0] =
      lowerWords[0].charAt(0).toUpperCase() + lowerWords[0].slice(1);
  }

  return lowerWords.join(' ');
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
  return `You fix mobile keyboard typing mistakes in casual chat messages.

TASK:
- Fix spelling, grammar, missing helper verbs (are/is/am), and awkward phrasing.
- Keep slang, tone, and meaning. You may insert short missing words when clearly needed.
- Never invent new phrases or reply to the message — only fix what was typed.
- Fix redundant wording (example: "today night this day" → "tonight").
- If the text is already correct, return it unchanged.
- Single line only — no line breaks or trailing newlines.

OUTPUT: Return ONLY valid JSON (no markdown):
{"text":"<corrected text>"}

TEXT:
${input}`;
}

function buildGeminiAutocorrectStrongPrompt(input: string): string {
  return `This casual mobile message has grammar mistakes from fast typing.

TASK:
- Fix missing helper verbs, subject-verb agreement, and redundant words.
- Keep slang (bro, lol, etc.) and the same meaning.
- Return the best natural version of the same message.
- Single line only — no line breaks.

OUTPUT: Return ONLY valid JSON (no markdown):
{"text":"<corrected text>"}

TEXT:
${input}`;
}

function buildTokenAutocorrectPrompt(input: string): string {
  return `You are correcting one mobile keyboard token.

TASK:
- Correct spelling, an obvious duplicated letter, or a missing apostrophe.
- Preserve the token's meaning and casing style.
- Do not expand, explain, or rewrite it.
- If it is already correct or is slang, return it unchanged.

OUTPUT: Return ONLY valid JSON (no markdown):
{"text":"<corrected token>"}

TOKEN:
${input}`;
}

/** Same plain-text parsing voice polish uses for on-device Gemma. */
function parseOnDeviceAutocorrectResult(raw: string, original = ''): string {
  const cleaned = original
    ? cleanOnDeviceTypeLiftOutput(raw, original)
    : null;
  if (cleaned) {
    return normalizeWhitespace(cleaned);
  }

  const trimmed = raw.trim();
  const firstSegment =
    trimmed
      .split(/(?:\\n|\r?\n)+/)
      .map(segment => segment.trim())
      .find(Boolean) ?? trimmed;
  const unquoted =
    firstSegment.startsWith('"') &&
    firstSegment.endsWith('"') &&
    firstSegment.length >= 2
      ? firstSegment.slice(1, -1)
      : firstSegment;
  const normalized = normalizeWhitespace(unquoted);
  if (isDegenerateTypeLiftOutput(normalized)) {
    return '';
  }
  return normalized;
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
    trimmed.lastIndexOf(', '),
    trimmed.lastIndexOf('; '),
    trimmed.lastIndexOf(': '),
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
  if (!/[\p{L}]/u.test(snippet)) {
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

  if (isDegenerateTypeLiftOutput(normalizedCorrection)) {
    console.log(LOG_PREFIX, 'reject: degenerate output', {
      original: normalizedOriginal,
      correction: normalizedCorrection,
    });
    return {kind: 'none'};
  }

  if (!isFaithfulTypeLiftCorrection(normalizedOriginal, normalizedCorrection, 'suggest')) {
    console.log(LOG_PREFIX, 'reject: unfaithful rewrite', {
      original: normalizedOriginal,
      correction: normalizedCorrection,
    });
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

  if (distance <= autoDistanceLimit && wordDelta <= 3) {
    if (!isFaithfulTypeLiftCorrection(normalizedOriginal, normalizedCorrection, 'auto')) {
      console.log(LOG_PREFIX, 'suggestion result (auto blocked)', {
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

async function generateGeminiProofread(
  input: string,
  promptBuilder: (value: string) => string = buildGeminiAutocorrectPrompt,
): Promise<string | null> {
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
          parts: [{text: promptBuilder(input)}],
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

async function generateProofread(
  input: string,
  promptBuilder: (value: string) => string = buildGeminiAutocorrectPrompt,
): Promise<string | null> {
  await ensureAiProviderLoaded();
  if (getAiProvider() === 'on_device') {
    console.log(LOG_PREFIX, 'on-device request', {input});
    const useTokenPrompt = promptBuilder === buildTokenAutocorrectPrompt;
    const prompt = useTokenPrompt
      ? buildTokenAutocorrectPrompt(input)
      : buildGemmaAutocorrectPrompt(input);
    const raw = await generateOnDeviceText(prompt);
    console.log(LOG_PREFIX, 'on-device raw response', {raw});
    return parseOnDeviceAutocorrectResult(raw, input);
  }

  const raw = await generateGeminiProofread(input, promptBuilder);
  if (!raw) {
    return null;
  }
  return parseGeminiAutocorrectResult(raw);
}

async function generateProofreadWithFallback(
  input: string,
  contextBefore = '',
): Promise<string | null> {
  const acceptCandidate = (candidate: string | null): string | null => {
    if (!candidate) {
      return null;
    }
    const normalized = finalizeTypeLiftCorrection(contextBefore, input, candidate);
    if (
      !normalized ||
      normalized === finalizeTypeLiftCorrection(contextBefore, input, input)
    ) {
      return null;
    }
    if (!isFaithfulTypeLiftCorrection(input, normalized, 'suggest')) {
      return null;
    }
    return normalized;
  };

  const first = acceptCandidate(await generateProofread(input));
  if (first) {
    return first;
  }

  if (!needsTypeLiftProofread(input)) {
    return null;
  }

  console.log(LOG_PREFIX, 'retry: unchanged but heuristics flagged issues', {
    input,
  });

  await ensureAiProviderLoaded();
  if (getAiProvider() === 'on_device') {
    const raw = await generateOnDeviceText(buildGemmaAutocorrectStrongPrompt(input));
    console.log(LOG_PREFIX, 'on-device strong raw response', {raw});
    const strong = acceptCandidate(parseOnDeviceAutocorrectResult(raw, input));
    if (strong) {
      return strong;
    }
  } else {
    const raw = await generateGeminiProofread(
      input,
      buildGeminiAutocorrectStrongPrompt,
    );
    if (raw) {
      const strong = acceptCandidate(parseGeminiAutocorrectResult(raw));
      if (strong) {
        return strong;
      }
    }
  }

  const heuristic = applyTypeLiftHeuristicFix(input);
  const heuristicAccepted = acceptCandidate(heuristic);
  if (heuristicAccepted) {
    console.log(LOG_PREFIX, 'heuristic fallback', {
      input,
      heuristic: heuristicAccepted,
    });
    return heuristicAccepted;
  }

  return null;
}

export async function proofreadRecentTypingContext(
  context: string,
): Promise<AiAutocorrectResult> {
  const original = lastProofreadSnippet(context);
  if (!original) {
    return {kind: 'none'};
  }

  try {
    const contextBefore = context.slice(0, context.length - original.length);
    const correction = await generateProofreadWithFallback(original, contextBefore);

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

/** Lightweight background correction for the currently typed word. */
export async function proofreadActiveToken(
  token: string,
): Promise<AiAutocorrectResult> {
  const normalized = token.trim();
  if (
    normalized.length < MIN_TOKEN_LENGTH ||
    !/^[A-Za-z][A-Za-z'-]*$/.test(normalized)
  ) {
    return {kind: 'none'};
  }

  try {
    const correction = await generateProofread(
      normalized,
      buildTokenAutocorrectPrompt,
    );
    if (!correction) {
      return {kind: 'none'};
    }
    const finalized = finalizeTypeLiftCorrection('', normalized, correction);
    return classifyCorrection(normalized, finalized);
  } catch (error) {
    console.log(LOG_PREFIX, 'token proofread failed', {
      message: error instanceof Error ? error.message : String(error),
    });
    return {kind: 'none'};
  }
}
