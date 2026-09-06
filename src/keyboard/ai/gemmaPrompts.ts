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

/** Single on-device TypeLift prompt — correct draft, apply tone. No few-shot examples (270M copies them). */
export function buildGemmaTypeLiftPrompt(
  text: string,
  toneInstruction: string,
): string {
  return wrapGemmaPrompt(
    `Task: correct the draft. Tone: ${toneInstruction}.

Hard rules:
- Rewrite the draft only.
- Fix spelling, grammar, wording.
- Same meaning. Same language.
- Keep names, numbers, URLs, @handles, emoji.
- Never apologize, comfort, chat, or explain.
- Never reuse words from examples unless they appear in the draft.
- Output one corrected message. Nothing else.

Draft:
<<<
${text}
>>>

Corrected:`,
  );
}

/** Shorter retry when the model echoes the draft unchanged. */
export function buildGemmaTypeLiftRetryPrompt(
  text: string,
  toneInstruction: string,
): string {
  return wrapGemmaPrompt(
    `Task: correct the draft. Tone: ${toneInstruction}.
Rewrite the draft only. Fix spelling and grammar. Same meaning. No apology or chat.
Output one corrected message. Nothing else.

Draft:
<<<
${text}
>>>

Corrected:`,
  );
}

export function buildGemmaAutocorrectPrompt(text: string): string {
  return wrapGemmaPrompt(`Fix spelling, grammar, and awkward mobile-typing mistakes in the message below.

Rules:
- Keep the SAME message. Do NOT reply, summarize, apologize, shorten, or rephrase.
- Keep every sentence and idea from the input. Do not delete clauses.
- Keep slang and casual tone (bro, lol, gonna, etc.).
- You MAY insert small missing words (are, is, am, a, the, to) when grammar clearly needs them.
- Fix misspellings and redundant wording only.
- Do not change the meaning or add new information.
- Single line only — no line breaks.

Return only the corrected message and nothing else.

Message:
"${text}"`);
}

export function buildGemmaAutocorrectStrongPrompt(text: string): string {
  return wrapGemmaPrompt(`Fix the mobile keyboard message below. Output the SAME message with spelling and grammar fixes only.

CRITICAL:
- Do NOT reply to the writer, apologize, summarize, or shorten the message.
- Keep every idea and sentence from the input. Do not remove clauses.
- Keep slang (bro, lol, etc.) and the same casual tone.
- Fix misspellings using the surrounding words. Never swap in a shorter unrelated word.
- Same language. Similar length (only add/remove a few small grammar words).

Return only the corrected message — no quotes, no explanation.

Message:
"${text}"`);
}

