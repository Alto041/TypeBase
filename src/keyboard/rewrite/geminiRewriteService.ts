import {GEMINI_API_KEY, GEMINI_API_URL} from '../translate/geminiConfig';
import {DEFAULT_REWRITE_TONE, REWRITE_TONES} from './rewriteTones';

export type RewriteResult = {
  rewritten: string;
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

function getToneInstruction(toneId: string): string {
  return (
    REWRITE_TONES.find(tone => tone.id === toneId)?.instruction ??
    REWRITE_TONES.find(tone => tone.id === DEFAULT_REWRITE_TONE)!.instruction
  );
}

function buildRewritePrompt(text: string, toneId: string): string {
  return `You are an expert writing assistant built into a mobile keyboard. Rewrite the user's text.

STYLE:
${getToneInstruction(toneId)}

RULES:
- Keep the same language as the input — never translate.
- Preserve names, numbers, URLs, email addresses, @handles, and emoji unless fixing obvious errors.
- Do not add greetings, sign-offs, or commentary the user did not write.
- Do not wrap the result in quotes.
- If the input is empty or not rewritable text, return {"rewritten":""}.
- Return ONLY valid JSON — no markdown, no code fences.

OUTPUT SCHEMA (strict):
{"rewritten":"<rewritten text>"}

TEXT:
${text}`;
}

function parseRewriteResult(raw: string): RewriteResult {
  const trimmed = raw.trim();
  const jsonText = trimmed.startsWith('```')
    ? trimmed.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
    : trimmed;

  const parsed = JSON.parse(jsonText) as Partial<RewriteResult>;

  if (typeof parsed.rewritten !== 'string') {
    throw new Error('Invalid rewrite response');
  }

  return {rewritten: parsed.rewritten};
}

export async function rewriteText(
  text: string,
  toneId: string = DEFAULT_REWRITE_TONE,
): Promise<RewriteResult> {
  const input = text.trim();
  if (!input) {
    return {rewritten: ''};
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
          parts: [{text: buildRewritePrompt(input, toneId)}],
        },
      ],
      generationConfig: {
        temperature: 0.25,
        maxOutputTokens: 2048,
        responseMimeType: 'application/json',
      },
    }),
  });

  const data = (await response.json()) as GeminiResponse;

  if (!response.ok) {
    throw new Error(data.error?.message ?? `Rewrite failed (${response.status})`);
  }

  const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!rawText) {
    throw new Error('Empty rewrite response');
  }

  return parseRewriteResult(rawText);
}
