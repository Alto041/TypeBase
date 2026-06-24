/** Gemma 3 instruct prompt wrapper (MediaPipe / LiteRT format). */
import {getFormatType} from '../format/formatTypes';
import type {FormatSession} from '../format/formatSessionStore';

export function wrapGemmaPrompt(instruction: string): string {
  return `<start_of_turn>user
${instruction.trim()}
<end_of_turn>
<start_of_turn>model
`;
}

export function buildGemmaTranslatePrompt(
  text: string,
  targetLanguage: string,
): string {
  return wrapGemmaPrompt(`Hey, I want you to translate the message into ${targetLanguage}.

Return only the translated text and nothing else.

Text:
"${text}"`);
}

export function buildGemmaRewritePrompt(text: string, toneInstruction: string): string {
  return wrapGemmaPrompt(`Rewrite the message according to this exact mode:

${toneInstruction}

Rules:
- Keep the same language as the input.
- Preserve names, numbers, URLs, @handles, and emoji.
- Do not add greetings, sign-offs, explanations, or markdown.
- Return only the rewritten text and nothing else.

Text:
"${text}"`);
}

export function buildGemmaFormatPrompt(text: string, formatId: string): string {
  const format = getFormatType(formatId);
  return wrapGemmaPrompt(`Hey, I want you to format the message for ${format.label}.

${format.instruction}

Keep the same language. Remove AI filler and markdown. Return only the formatted text and nothing else.

Text:
"${text}"`);
}

export function buildGemmaFormatFollowUpPrompt(
  currentText: string,
  followUpInstruction: string,
  session: FormatSession | null | undefined,
): string {
  const history =
    session?.turns
      .slice(-4)
      .map(turn => `${turn.role === 'user' ? 'User' : 'Assistant'}: ${turn.text}`)
      .join('\n') ?? '';

  const historyBlock = history ? `\n\nEarlier in this session:\n${history}` : '';

  return wrapGemmaPrompt(`Hey, refine the formatted message below.

Change: ${followUpInstruction}

Return only the updated text and nothing else.${historyBlock}

Text:
"${currentText}"`);
}

export function buildGemmaVoiceCleanupPrompt(transcript: string): string {
  return wrapGemmaPrompt(`Hey, I want you to improve the message, fix grammatical mistakes, and make it sound natural and easy to read.

Return only the polished text and nothing else.

Text:
"${transcript}"`);
}

export function buildGemmaAutocorrectPrompt(text: string): string {
  return wrapGemmaPrompt(`Hey, fix all spelling mistakes, grammar errors, missing apostrophes, and punctuation in the message below. Keep slang (like bro), the same words, and the same meaning — do not rephrase or add new ideas.

Return only the corrected text and nothing else.

Text:
"${text}"`);
}
