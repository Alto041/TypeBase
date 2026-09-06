import {generateOnDeviceText} from '../ai/onDeviceTextAi';
import {GEMINI_GENERATION_CONFIG} from '../ai/generationConfig';
import {
  buildGemmaTypeLiftPrompt,
  buildGemmaTypeLiftRetryPrompt,
} from '../ai/gemmaPrompts';
import {
  cleanOnDeviceTypeLiftOutput,
  isDegenerateTypeLiftOutput,
  isFaithfulTypeLiftCorrection,
} from './typeLiftFaithfulness';
import {TYPELIFT_DEFAULT_TONE} from './typeLiftBranding';
import {hasDictionaryWord} from './dictionaryManager';
import {shouldAutoCapitalize} from '../autoCapitalize';
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
      .replace(/\\+$/g, '')
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
  return `This mobile keyboard message has spelling and grammar mistakes from fast typing.

TASK:
- Fix misspellings, missing helper verbs, and awkward phrasing only.
- Keep the SAME message. Do NOT reply, apologize, summarize, or shorten it.
- Keep every idea and sentence from the input. Do not remove clauses.
- Keep slang (bro, lol, etc.) and the same casual tone.
- Single line only — no line breaks.

OUTPUT: Return ONLY valid JSON (no markdown):
{"text":"<corrected text>"}

TEXT:
${input}`;
}

function buildGeminiAutocorrectContextPrompt(input: string): string {
  return `Fix the mobile keyboard message using context. Return the SAME message with mistakes corrected.

Examples (use nearby words to pick the right fix):
- "like a piec of garbage" → "like a piece of garbage"
- "such an acion to me" → "such an action to me"
- "i already spend a lot" → "i already spent a lot"

TASK:
- Keep every sentence and idea. Do NOT reply, apologize, summarize, or shorten.
- Fix spelling and grammar using context. Never replace a word with a shorter lookalike.
- Keep slang (bro, lol, etc.). Single line only — no line breaks.

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

function maxTypeLiftOutputChars(input: string): number {
  return Math.max(64, Math.min(512, Math.ceil(input.length * 2) + 32));
}

/** Same plain-text parsing voice polish uses for on-device Gemma. */
function stripGemmaTurnTokens(text: string): string {
  return text
    .replace(/<end_of_turn>/gi, '')
    .replace(/<start_of_turn>\w*/gi, '')
    .trim();
}

function parseOnDeviceTypeLiftResult(
  raw: string,
  original = '',
  maxLen?: number,
): string {
  let text = stripGemmaTurnTokens(raw);
  const cap = maxLen ?? (original ? maxTypeLiftOutputChars(original) : 256);

  const stopMatch = text.match(
    /\n(?:Draft:|Corrected:|Input:|Output:|Mode:|Broken:|Fixed:)\s*/i,
  );
  if (stopMatch?.index != null && stopMatch.index > 0) {
    text = text.slice(0, stopMatch.index);
  }

  const correctedLine = text.match(/(?:^|\n)Corrected:\s*(.+)$/im);
  if (correctedLine?.[1]) {
    text = correctedLine[1].trim();
  }

  const outputLine = text.match(/(?:^|\n)Output:\s*(.+)$/im);
  if (outputLine?.[1]) {
    text = outputLine[1].trim();
  }

  const fixedLine = text.match(/(?:^|\n)Fixed:\s*(.+)$/im);
  if (fixedLine?.[1]) {
    text = fixedLine[1].trim();
  }

  if (text.includes('<<<')) {
    text = text.replace(/<<<\s*[\s\S]*?\s*>>>/g, '').trim();
  }

  text =
    text
      .split(/\r?\n+/)
      .map(segment => segment.trim())
      .filter(
        segment =>
          segment &&
          !/^(?:draft|corrected|broken|fixed|input|output|mode):/i.test(segment) &&
          segment !== '<<<' &&
          segment !== '>>>',
      )
      .find(Boolean) ?? text;

  text = text
    .replace(/^(?:Corrected|Draft|Output|Input|Fixed|Broken):\s*/i, '')
    .replace(/^<<<\s*/, '')
    .replace(/\s*>>>$/, '')
    .replace(/\\+$/g, '')
    .trim();

  if (text.startsWith('"') && text.endsWith('"') && text.length >= 2) {
    text = text.slice(1, -1).trim();
  }

  if (text.length > cap) {
    text = text.slice(0, cap).trim();
  }

  const cleaned = original ? cleanOnDeviceTypeLiftOutput(text, original) : null;
  if (cleaned) {
    return normalizeWhitespace(cleaned);
  }

  const normalized = normalizeWhitespace(text);
  if (isDegenerateTypeLiftOutput(normalized)) {
    return '';
  }
  return normalized;
}

function parseOnDeviceAutocorrectResult(raw: string, original = ''): string {
  return parseOnDeviceTypeLiftResult(raw, original);
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

function classifyOnDeviceTypeLiftCorrection(
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

  if (isCosmeticOnlyCorrection(original, correction)) {
    console.log(LOG_PREFIX, 'reject: cosmetic only', {
      original: normalizedOriginal,
      correction: normalizedCorrection,
    });
    return {kind: 'none'};
  }

  const distance = levenshtein(
    normalizedOriginal.toLowerCase(),
    normalizedCorrection.toLowerCase(),
  );
  const autoDistanceLimit = Math.min(
    120,
    Math.max(24, Math.ceil(normalizedOriginal.length * 0.85)),
  );

  if (distance <= autoDistanceLimit) {
    console.log(LOG_PREFIX, 'auto result (on-device)', {
      original: normalizedOriginal,
      correction: normalizedCorrection,
      distance,
      autoDistanceLimit,
    });
    return {
      kind: 'auto',
      original,
      correction: normalizedCorrection,
    };
  }

  console.log(LOG_PREFIX, 'suggestion result (on-device)', {
    original: normalizedOriginal,
    correction: normalizedCorrection,
    distance,
  });
  return {
    kind: 'suggest',
    original,
    correction: normalizedCorrection,
  };
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

async function runOnDeviceTypeLift(
  input: string,
  toneInstruction = TYPELIFT_DEFAULT_TONE,
): Promise<string | null> {
  const maxTokens = maxTypeLiftOutputChars(input);
  const prompt = buildGemmaTypeLiftPrompt(input, toneInstruction);
  console.log(LOG_PREFIX, 'on-device prompt', {prompt, maxTokens, toneInstruction});

  const raw = await generateOnDeviceText(prompt, {temperature: 0});
  console.log(LOG_PREFIX, 'on-device raw response', {raw});
  const parsed = parseOnDeviceTypeLiftResult(raw, input, maxTokens);
  if (parsed && !isCosmeticOnlyCorrection(input, parsed)) {
    return parsed;
  }

  console.log(LOG_PREFIX, 'on-device retry: unchanged output', {
    input,
    parsed,
  });
  const retryPrompt = buildGemmaTypeLiftRetryPrompt(input, toneInstruction);
  const retryRaw = await generateOnDeviceText(retryPrompt, {temperature: 0.2});
  console.log(LOG_PREFIX, 'on-device retry raw response', {raw: retryRaw});
  const retryParsed = parseOnDeviceTypeLiftResult(retryRaw, input, maxTokens);
  return retryParsed || null;
}

async function generateProofread(
  input: string,
  promptBuilder: (value: string) => string = buildGeminiAutocorrectPrompt,
): Promise<string | null> {
  await ensureAiProviderLoaded();
  if (getAiProvider() === 'on_device') {
    console.log(LOG_PREFIX, 'on-device request', {input});
    const useTokenPrompt = promptBuilder === buildTokenAutocorrectPrompt;
    if (useTokenPrompt) {
      const raw = await generateOnDeviceText(buildTokenAutocorrectPrompt(input));
      console.log(LOG_PREFIX, 'on-device raw response', {raw});
      return parseOnDeviceTypeLiftResult(raw, input);
    }

    return runOnDeviceTypeLift(input);
  }

  const raw = await generateGeminiProofread(input, promptBuilder);
  if (!raw) {
    return null;
  }
  return parseGeminiAutocorrectResult(raw);
}

function isCollapsedRewrite(original: string, candidate: string): boolean {
  const orig = normalizeWhitespace(original);
  const clean = normalizeWhitespace(candidate);
  if (!orig || !clean || clean === orig) {
    return false;
  }

  const origWords = orig.split(/\s+/).filter(Boolean);
  const cleanWords = clean.split(/\s+/).filter(Boolean);
  if (origWords.length >= 8 && cleanWords.length <= Math.ceil(origWords.length * 0.72)) {
    return true;
  }

  return clean.length < Math.max(24, Math.floor(orig.length * 0.72));
}

const CHATBOT_REPLY_PATTERNS = [
  /^hey[,! ]+i'?m (?:so )?sorry\b/i,
  /^i'?m (?:so )?sorry to hear\b/i,
  /^sorry to hear that\b/i,
  /^that sounds (?:really )?(?:tough|hard|difficult)\b/i,
];

function isChatbotReply(original: string, candidate: string): boolean {
  const trimmedCandidate = candidate.trim();
  if (!trimmedCandidate) {
    return false;
  }

  if (!CHATBOT_REPLY_PATTERNS.some(pattern => pattern.test(trimmedCandidate))) {
    return false;
  }

  const trimmedOriginal = original.trim();
  return !CHATBOT_REPLY_PATTERNS.some(pattern => pattern.test(trimmedOriginal));
}

function isShallowDictionarySwap(originalWord: string, correctionWord: string): boolean {
  const original = originalWord.replace(/[^\p{L}\p{M}']/gu, '');
  const correction = correctionWord.replace(/[^\p{L}\p{M}']/gu, '');
  if (!original || !correction) {
    return false;
  }

  const o = original.toLowerCase();
  const c = correction.toLowerCase();
  if (o === c) {
    return false;
  }

  if (hasDictionaryWord(o)) {
    return false;
  }

  if (!hasDictionaryWord(c)) {
    return false;
  }

  const distance = levenshtein(o, c);
  if (distance > 2) {
    return false;
  }

  // piec→pic, acion→acton: unknown typo became a shorter/equal valid word without context.
  return c.length <= o.length;
}

function hasShallowWordSwaps(original: string, correction: string): boolean {
  const origWords = original.trim().split(/\s+/).filter(Boolean);
  const cleanWords = correction.trim().split(/\s+/).filter(Boolean);
  if (origWords.length !== cleanWords.length) {
    return false;
  }

  for (let index = 0; index < origWords.length; index += 1) {
    if (isShallowDictionarySwap(origWords[index]!, cleanWords[index]!)) {
      return true;
    }
  }

  return false;
}

const TYPOLIFT_SKIP_WORDS = new Set([
  'bro',
  'bruh',
  'lol',
  'ok',
  'okay',
  'im',
  'ive',
  'idk',
  'omg',
  'tbh',
  'ngl',
]);

function isCosmeticOnlyCorrection(original: string, correction: string): boolean {
  const normalize = (value: string) =>
    normalizeWhitespace(value)
      .toLowerCase()
      .replace(/\\/g, '')
      .replace(/[^\p{L}\p{N}\s']/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim();

  return normalize(original) === normalize(correction);
}

/** Reject when OOV typo tokens like piec/acion/randmonly survived unchanged. */
function leavesKnownTyposUnfixed(original: string, correction: string): boolean {
  const words = original.match(/[\p{L}']+/gu) ?? [];
  for (const word of words) {
    const lower = word.toLowerCase();
    if (lower.length < 4 || TYPOLIFT_SKIP_WORDS.has(lower)) {
      continue;
    }
    if (hasDictionaryWord(lower)) {
      continue;
    }

    const pattern = new RegExp(
      `(?<![\\p{L}'])${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}'])`,
      'iu',
    );
    if (pattern.test(correction)) {
      return true;
    }
  }

  return false;
}

async function generateProofreadWithFallback(
  input: string,
  contextBefore = '',
): Promise<string | null> {
  await ensureAiProviderLoaded();
  const onDevice = getAiProvider() === 'on_device';

  const acceptCandidate = (candidate: string | null): string | null => {
    if (!candidate) {
      return null;
    }

    if (onDevice) {
      if (isCosmeticOnlyCorrection(input, candidate)) {
        console.log(LOG_PREFIX, 'reject: cosmetic only', {
          original: input,
          candidate,
        });
        return null;
      }
      const normalized = finalizeTypeLiftCorrection(contextBefore, input, candidate);
      if (
        !normalized ||
        normalized === finalizeTypeLiftCorrection(contextBefore, input, input)
      ) {
        return null;
      }
      if (isDegenerateTypeLiftOutput(normalized)) {
        return null;
      }
      return normalized;
    }

    if (isCollapsedRewrite(input, candidate)) {
      console.log(LOG_PREFIX, 'reject: collapsed rewrite', {
        original: input,
        candidate,
      });
      return null;
    }
    if (isChatbotReply(input, candidate)) {
      console.log(LOG_PREFIX, 'reject: chatbot reply', {
        original: input,
        candidate,
      });
      return null;
    }
    if (isCosmeticOnlyCorrection(input, candidate)) {
      console.log(LOG_PREFIX, 'reject: cosmetic only', {
        original: input,
        candidate,
      });
      return null;
    }
    const normalized = finalizeTypeLiftCorrection(contextBefore, input, candidate);
    if (
      !normalized ||
      normalized === finalizeTypeLiftCorrection(contextBefore, input, input)
    ) {
      return null;
    }
    if (hasShallowWordSwaps(input, normalized)) {
      console.log(LOG_PREFIX, 'reject: shallow dictionary swap', {
        original: input,
        candidate: normalized,
      });
      return null;
    }
    if (leavesKnownTyposUnfixed(input, normalized)) {
      console.log(LOG_PREFIX, 'reject: typos still unfixed', {
        original: input,
        candidate: normalized,
      });
      return null;
    }
    if (!isFaithfulTypeLiftCorrection(input, normalized, 'suggest')) {
      return null;
    }
    return normalized;
  };

  const firstRaw = await generateProofread(input);
  const first = acceptCandidate(firstRaw);
  if (first) {
    return first;
  }

  await ensureAiProviderLoaded();
  if (getAiProvider() === 'on_device') {
    const apiKey = await getGeminiApiKeyOptional();
    if (apiKey) {
      console.log(LOG_PREFIX, 'cloud fallback', {input});
      const cloudRaw = await generateGeminiProofread(
        input,
        buildGeminiAutocorrectContextPrompt,
      );
      if (cloudRaw) {
        const cloud = acceptCandidate(parseGeminiAutocorrectResult(cloudRaw));
        if (cloud) {
          return cloud;
        }
      }
    }
    return null;
  }

  const strongRaw = await generateGeminiProofread(
    input,
    buildGeminiAutocorrectStrongPrompt,
  );
  if (strongRaw) {
    const strong = acceptCandidate(parseGeminiAutocorrectResult(strongRaw));
    if (strong) {
      return strong;
    }
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

    await ensureAiProviderLoaded();
    if (getAiProvider() === 'on_device') {
      return classifyOnDeviceTypeLiftCorrection(original, correction);
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
