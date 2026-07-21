import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  DEFAULT_ONE_HAND_SETTINGS,
  ONE_HAND_MAX_SHRINK_RATIO,
  ONE_HAND_MIN_WIDTH_RATIO,
  type OneHandSettings,
  type OneHandSide,
} from './types';

const STORAGE_KEY = '@typebase/one_hand_v1';

let cached: OneHandSettings = {...DEFAULT_ONE_HAND_SETTINGS};
let loadPromise: Promise<void> | null = null;
const listeners = new Set<() => void>();

function clampStrength(value: number): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_ONE_HAND_SETTINGS.strength;
  }
  return Math.min(1, Math.max(0.15, value));
}

function normalize(raw: Partial<OneHandSettings> | null | undefined): OneHandSettings {
  const side = raw?.side;
  return {
    enabled: Boolean(raw?.enabled),
    side:
      side === 'left' || side === 'right' || side === 'center'
        ? side
        : DEFAULT_ONE_HAND_SETTINGS.side,
    strength: clampStrength(
      typeof raw?.strength === 'number'
        ? raw.strength
        : DEFAULT_ONE_HAND_SETTINGS.strength,
    ),
  };
}

function notify(): void {
  for (const listener of listeners) {
    listener();
  }
}

async function persist(): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(cached));
  } catch {
    /* ignore */
  }
}

export function subscribeOneHandSettings(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getOneHandSettings(): OneHandSettings {
  return {...cached};
}

export async function ensureOneHandLoaded(): Promise<void> {
  if (loadPromise) {
    return loadPromise;
  }
  loadPromise = (async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw) {
        cached = normalize(JSON.parse(raw) as Partial<OneHandSettings>);
      } else {
        cached = {...DEFAULT_ONE_HAND_SETTINGS};
      }
    } catch {
      cached = {...DEFAULT_ONE_HAND_SETTINGS};
    }
  })();
  try {
    await loadPromise;
  } catch {
    cached = {...DEFAULT_ONE_HAND_SETTINGS};
    loadPromise = null;
  }
}

export async function setOneHandEnabled(enabled: boolean): Promise<void> {
  cached = {...cached, enabled};
  notify();
  await persist();
}

export async function setOneHandSide(side: OneHandSide): Promise<void> {
  cached = {
    ...cached,
    side,
    enabled: side === 'center' ? false : true,
  };
  notify();
  await persist();
}

export async function setOneHandStrength(strength: number): Promise<void> {
  cached = {...cached, strength: clampStrength(strength), enabled: true};
  if (cached.side === 'center') {
    cached = {...cached, side: 'right'};
  }
  notify();
  await persist();
}

export async function resetOneHandSettings(): Promise<void> {
  cached = {...DEFAULT_ONE_HAND_SETTINGS};
  notify();
  await persist();
}

export type OneHandLayout = {
  active: boolean;
  /** Width of the key content as a fraction of the viewport (0..1). */
  widthRatio: number;
  /** Absolute width in dp for the key container. */
  width: number;
  /** How the key container aligns inside the full keyboard width. */
  alignSelf: 'stretch' | 'flex-start' | 'flex-end';
};

/** Narrow + side-aligned layout so keys shrink to fit instead of overflowing. */
export function getOneHandLayout(
  settings: OneHandSettings,
  viewportWidth: number,
): OneHandLayout {
  if (!settings.enabled || settings.side === 'center' || viewportWidth <= 0) {
    return {
      active: false,
      widthRatio: 1,
      width: viewportWidth,
      alignSelf: 'stretch',
    };
  }

  const widthRatio = Math.max(
    ONE_HAND_MIN_WIDTH_RATIO,
    1 - ONE_HAND_MAX_SHRINK_RATIO * clampStrength(settings.strength),
  );

  return {
    active: true,
    widthRatio,
    width: Math.round(viewportWidth * widthRatio),
    alignSelf: settings.side === 'left' ? 'flex-start' : 'flex-end',
  };
}
