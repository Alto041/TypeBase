import {InteractionManager} from 'react-native';

import {ensureAutocorrectLoaded} from './autocorrect/autocorrectStore';
import {
  preloadActiveDictionary,
  scheduleBackgroundEnglishSymSpellSeed,
} from './autocorrect/dictionaryManager';
import {preloadContextBigrams} from './autocorrect/contextBigrams';
import {ensureEnglishAccuracyBootstrap} from './autocorrect/englishFrequencyDictionary';
import {ensurePersonalTypingLoaded} from './personalTyping/personalTypingEngine';
import {startVoiceSttWarmup} from './voice/voiceSttWarmup';

/** Settings + personal data — enough for boundary autocorrect without blocking. */
let minimalReady = false;
/** Prefix index + full preload finished (background). */
let bootstrapReady = false;
let warmupPromise: Promise<void> | null = null;
let minimalWaiters: Array<() => void> = [];
let heavyWaiters: Array<() => void> = [];
let deferredDictionaryWarmupScheduled = false;

/** Let the first taps settle before SymSpell / word-set work. */
const DICTIONARY_WARMUP_DELAY_MS = 900;
/** Full dictionary + bigrams after autocorrect settings are ready. */
const HEAVY_WARMUP_DELAY_MS = 6_000;

function scheduleDeferredDictionaryWarmup(): void {
  if (deferredDictionaryWarmupScheduled) {
    return;
  }
  deferredDictionaryWarmupScheduled = true;
  InteractionManager.runAfterInteractions(() => {
    setTimeout(() => {
      ensureEnglishAccuracyBootstrap();
      scheduleBackgroundEnglishSymSpellSeed();
    }, DICTIONARY_WARMUP_DELAY_MS);
  });
}

function notifyMinimalReady(): void {
  const waiters = minimalWaiters;
  minimalWaiters = [];
  waiters.forEach(resolve => resolve());
}

export function isMinimalSuggestionEngineReady(): boolean {
  return minimalReady;
}

export function isSuggestionEngineReady(): boolean {
  return bootstrapReady;
}

/** Idempotent — safe on every key / keyboardShown. Never blocks the caller. */
export function startSuggestionEngineWarmup(): void {
  scheduleDeferredDictionaryWarmup();
  startVoiceSttWarmup();

  if (minimalReady) {
    if (!bootstrapReady && !warmupPromise) {
      warmupPromise = runHeavyWarmupPhase().finally(() => {
        warmupPromise = null;
      });
    }
    return;
  }

  if (warmupPromise) {
    return;
  }

  warmupPromise = runMinimalWarmupPhase()
    .then(() => {
      if (!bootstrapReady) {
        return runHeavyWarmupPhase();
      }
      return undefined;
    })
    .finally(() => {
      warmupPromise = null;
    });
}

async function runMinimalWarmupPhase(): Promise<void> {
  await Promise.all([ensurePersonalTypingLoaded(), ensureAutocorrectLoaded()]);
  minimalReady = true;
  notifyMinimalReady();
}

async function runHeavyWarmupPhase(): Promise<void> {
  if (bootstrapReady) {
    return;
  }
  await new Promise<void>(resolve => {
    setTimeout(resolve, HEAVY_WARMUP_DELAY_MS);
  });
  await preloadActiveDictionary();
  bootstrapReady = true;
  preloadContextBigrams();
  const waiters = heavyWaiters;
  heavyWaiters = [];
  waiters.forEach(resolve => resolve());
}

/** Resolves once settings/personal typing are loaded — does not wait for full dictionary. */
export function waitForMinimalSuggestionEngine(): Promise<void> {
  if (minimalReady) {
    return Promise.resolve();
  }
  startSuggestionEngineWarmup();
  return new Promise(resolve => {
    minimalWaiters.push(resolve);
  });
}

/** Full warm — use only off the typing hot path (settings, tests). */
export function ensureSuggestionEngineReady(): Promise<void> {
  startSuggestionEngineWarmup();
  if (bootstrapReady) {
    return Promise.resolve();
  }
  return waitForMinimalSuggestionEngine().then(() => {
    if (bootstrapReady) {
      return;
    }
    return new Promise<void>(resolve => {
      heavyWaiters.push(resolve);
      startSuggestionEngineWarmup();
    });
  });
}
