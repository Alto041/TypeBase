/** Gemma 3 instruct prompt wrapper (MediaPipe / LiteRT format). */
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

export function buildGemmaRewritePrompt(text: string, _toneInstruction: string): string {
  return wrapGemmaPrompt(`Hey, I want you to rewrite the message and make it sound better while keeping the original meaning.

Return only the rewritten text and nothing else.

Text:
"${text}"`);
}

export function buildGemmaVoiceCleanupPrompt(transcript: string): string {
  return wrapGemmaPrompt(`Hey, I want you to improve the message, fix grammatical mistakes, and make it sound natural and easy to read.

Return only the polished text and nothing else.

Text:
"${transcript}"`);
}
