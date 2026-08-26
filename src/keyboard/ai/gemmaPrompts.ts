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
  return wrapGemmaPrompt(`Clean up this raw speech-to-text transcript for a mobile keyboard.

Rules:
- Keep the same words and meaning. Do NOT rephrase or add new ideas.
- Remove speech fillers that add no meaning (um, uh, hmm, er, ah, mhm, and similar).
- Only fix capitalization, ending punctuation, and obvious STT duplicates.
- Keep slang, names, numbers, and mixed-language text unchanged.
- Never translate.

Return only the cleaned text and nothing else.

Text:
"${transcript}"`);
}

export function buildGemmaParakeetCleanupPrompt(transcript: string): string {
  return wrapGemmaPrompt(`Fix this dictation. Remove any remaining um/uh/hmm fillers and repeated words. Keep the same meaning. Output only the cleaned sentence.

"${transcript}"`);
}

export function buildGemmaAutocorrectPrompt(text: string): string {
  return wrapGemmaPrompt(`Fix spelling, grammar, and awkward mobile-typing mistakes in the message below.

Rules:
- Keep slang and casual tone (bro, lol, gonna, etc.).
- You MAY insert small missing words (are, is, am, a, the, to) when grammar clearly needs them.
- Fix redundant wording (example: "today night this day" → "tonight").
- Light punctuation and capitalization fixes are OK.
- Do not change the meaning or add new information.
- Never invent new phrases or answer the message — only fix what was typed.
- Single line only — no line breaks.

Return only the corrected text and nothing else.

Text:
"${text}"`);
}

export function buildGemmaAutocorrectStrongPrompt(text: string): string {
  return wrapGemmaPrompt(`This mobile message has grammar mistakes from fast typing. Fix missing helper verbs, awkward phrasing, and redundant words.

Keep the same casual vibe and slang. You may insert short words like "are" or "is" when clearly missing.
Single line only — no line breaks.

Return only the corrected text and nothing else.

Text:
"${text}"`);
}
