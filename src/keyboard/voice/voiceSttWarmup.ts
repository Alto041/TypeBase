import {ensureGemmaModelLoaded} from '../ai/gemmaModelManager';
import {isGemmaModelDownloaded, isGemmaNativeAvailable} from '../ai/gemmaBridge';
import {
  ensureVoiceSttProviderLoaded,
  getVoiceSttProvider,
} from '../settings/voiceSttProviderStore';
import {prepareParakeetStt, isParakeetModelDownloaded} from './parakeetBridge';

let warmupStarted = false;
const VOICE_STT_WARMUP_DELAY_MS = 75_000;

/** Preload Parakeet STT pipeline and on-device Gemma for faster voice typing. */
export function startVoiceSttWarmup(): void {
  if (warmupStarted) {
    return;
  }
  warmupStarted = true;

  setTimeout(() => {
    void (async () => {
    try {
      await ensureVoiceSttProviderLoaded();
      if (getVoiceSttProvider() !== 'parakeet') {
        return;
      }
      if (!(await isParakeetModelDownloaded())) {
        return;
      }

      await prepareParakeetStt();

      if (isGemmaNativeAvailable() && (await isGemmaModelDownloaded())) {
        await ensureGemmaModelLoaded();
      }
    } catch {
      // Warmup is best-effort; voice still works on demand.
    }
    })();
  }, VOICE_STT_WARMUP_DELAY_MS);
}
