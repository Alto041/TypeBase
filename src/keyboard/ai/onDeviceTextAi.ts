import {
  getAiProvider,
  isOnDeviceAiProvider,
} from '../settings/aiProviderStore';
import {askGemma} from './gemmaBridge';
import {ensureGemmaModelLoaded} from './gemmaModelManager';

export async function generateOnDeviceText(prompt: string): Promise<string> {
  await ensureGemmaModelLoaded();
  const raw = await askGemma(prompt);
  return raw.trim();
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
