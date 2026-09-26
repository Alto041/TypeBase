import gboardEmojiBundle from './data/android_gboard_emojis.json';
import {NativeModules, Platform} from 'react-native';
import {
  ANDROID_SDK_FOR_EMOJI_UNICODE_17,
  supportsUnicodeEmojiVersion,
} from './emojiPlatformSupport';

export {ANDROID_SDK_FOR_EMOJI_UNICODE_17};

type GboardEmojiEntry = {
  emoji: string;
  name: string;
  slug: string;
  unicode_version?: string;
};

type GboardEmojiCategory = {
  id: string;
  label: string;
  emojis: GboardEmojiEntry[];
};

const bundle = gboardEmojiBundle as {
  meta: {categories_order: string[]};
  categories: GboardEmojiCategory[];
};

export const GBOARD_EMOJI_CATEGORY_ORDER = bundle.meta.categories_order;

/** Not shown in picker, search, or context preface. */
const EXCLUDED_EMOJI_GLYPHS = new Set<string>([
  '🏳️\u200D🌈',
  '🏳️\u200D⚧️',
  '🇮🇱',
]);

let androidSdkInt = 0;
let androidSdkKnown = false;
let sdkInitialized = false;

type CatalogListener = () => void;
const catalogListeners = new Set<CatalogListener>();

export function subscribeEmojiCatalog(listener: CatalogListener): () => void {
  catalogListeners.add(listener);
  return () => {
    catalogListeners.delete(listener);
  };
}

function notifyEmojiCatalogChanged(): void {
  for (const listener of catalogListeners) {
    listener();
  }
}

/** Call when native SDK is known (keyboard startup). */
export function setEmojiCatalogAndroidSdk(
  sdk: number,
  sdkKnown = true,
): void {
  androidSdkInt = Math.max(0, sdk | 0);
  androidSdkKnown = sdkKnown;
  rebuildFilteredCaches();
  notifyEmojiCatalogChanged();
}

export function getEmojiCatalogAndroidSdk(): number {
  return androidSdkInt;
}

function entrySupported(entry: GboardEmojiEntry): boolean {
  if (EXCLUDED_EMOJI_GLYPHS.has(entry.emoji)) {
    return false;
  }
  return supportsUnicodeEmojiVersion(
    entry.unicode_version,
    androidSdkInt,
    androidSdkKnown,
  );
}

const emojiUnicodeVersionByGlyph = new Map<string, string | undefined>();
for (const category of bundle.categories) {
  for (const entry of category.emojis) {
    if (!emojiUnicodeVersionByGlyph.has(entry.emoji)) {
      emojiUnicodeVersionByGlyph.set(entry.emoji, entry.unicode_version);
    }
  }
}

export function isEmojiInCatalog(emoji: string): boolean {
  ensureAndroidSdkFromNative();
  if (EXCLUDED_EMOJI_GLYPHS.has(emoji)) {
    return false;
  }
  const version = emojiUnicodeVersionByGlyph.get(emoji);
  if (version === undefined) {
    return true;
  }
  return supportsUnicodeEmojiVersion(
    version,
    androidSdkInt,
    androidSdkKnown,
  );
}

let gboardEmojisByCategory: Record<string, readonly string[]> = {};
let searchIndex: Array<{
  emoji: string;
  name: string;
  slug: string;
}> = [];

function rebuildFilteredCaches(): void {
  gboardEmojisByCategory = Object.fromEntries(
    bundle.categories.map(category => [
      category.id,
      category.emojis.filter(entrySupported).map(entry => entry.emoji),
    ]),
  );

  searchIndex = bundle.categories.flatMap(category =>
    category.emojis.filter(entrySupported).map(entry => ({
      emoji: entry.emoji,
      name: entry.name.toLowerCase(),
      slug: entry.slug.toLowerCase(),
    })),
  );
}

rebuildFilteredCaches();

function readNativeAndroidSdkInt(): {sdk: number; known: boolean} {
  if (Platform.OS !== 'android') {
    return {sdk: 0, known: false};
  }
  const {KeyboardModule} = NativeModules as {
    KeyboardModule?: {getAndroidSdkIntSync?: () => number};
  };
  if (!KeyboardModule?.getAndroidSdkIntSync) {
    return {sdk: 0, known: false};
  }
  return {sdk: KeyboardModule.getAndroidSdkIntSync(), known: true};
}

function ensureAndroidSdkFromNative(): void {
  if (sdkInitialized) {
    return;
  }
  sdkInitialized = true;
  const {sdk, known} = readNativeAndroidSdkInt();
  setEmojiCatalogAndroidSdk(sdk, known);
}

export function getGboardEmojisByCategoryId(
  categoryId: string,
): readonly string[] {
  ensureAndroidSdkFromNative();
  return gboardEmojisByCategory[categoryId] ?? [];
}

export function searchEmojis(query: string, limit = 180): string[] {
  ensureAndroidSdkFromNative();
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return [];
  }

  const terms = normalized.split(/\s+/).filter(Boolean);
  const results: string[] = [];
  const seen = new Set<string>();

  for (const entry of searchIndex) {
    const haystack = `${entry.name} ${entry.slug}`;
    if (!terms.every(term => haystack.includes(term))) {
      continue;
    }
    if (seen.has(entry.emoji)) {
      continue;
    }
    seen.add(entry.emoji);
    results.push(entry.emoji);
    if (results.length >= limit) {
      break;
    }
  }

  return results;
}
