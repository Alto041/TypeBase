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
  return wrapGemmaPrompt(`You are a professional translator built into a mobile keyboard.

TASK:
- Auto-detect the source language of the input text.
- Translate the text into ${targetLanguage}.
- Return ONLY a single JSON object — no markdown, no code fences, no explanation.

OUTPUT SCHEMA (strict):
{"detectedLanguage":"<language name in English>","detectedLanguageCode":"<ISO 639-1 code>","translation":"<translated text>"}

TARGET LANGUAGE: ${targetLanguage}

TEXT:
${text}`);
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
