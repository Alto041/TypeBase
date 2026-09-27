import {
  getAiProvider,
  isOnDeviceAiProvider,
} from '../settings/aiProviderStore';
import {askGemma, type GemmaGenerateOptions} from './gemmaBridge';
import {ensureGemmaModelLoaded} from './gemmaModelManager';

export type OnDeviceTextOptions = GemmaGenerateOptions;

/** MediaPipe sessions are not safe to overlap — queue keyboard Gemma calls. */
let inferenceChain: Promise<unknown> = Promise.resolve();

export async function generateOnDeviceText(
  prompt: string,
  options?: OnDeviceTextOptions,
): Promise<string> {
  const run = inferenceChain.then(async () => {
    await ensureGemmaModelLoaded();
    return askGemma(prompt, options);
  });
  inferenceChain = run.catch(() => undefined);
  const raw = await run;
  return typeof raw === 'string' ? raw.trim() : '';
}

export async function shouldUseOnDeviceAi(): Promise<boolean> {
  return isOnDeviceAiProvider(await getAiProvider());
}

export function extractJsonPayload(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith('```')) {
    return trimmed.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  }

  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start >= 0 && end > start) {
    return trimmed.slice(start, end + 1);
  }

  return trimmed;
}
