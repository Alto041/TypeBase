/** Unicode Emoji 17.0 / Google Noto 3D set ships with Android 17 (API 37). */
export const ANDROID_SDK_FOR_EMOJI_UNICODE_17 = 37;

const UNICODE_VERSION_CACHE = new Map<string, number>();

export function parseUnicodeEmojiVersion(raw: string | undefined): number {
  if (!raw) {
    return 0;
  }
  let cached = UNICODE_VERSION_CACHE.get(raw);
  if (cached !== undefined) {
    return cached;
  }
  const major = parseFloat(raw);
  cached = Number.isFinite(major) ? major : 0;
  UNICODE_VERSION_CACHE.set(raw, cached);
  return cached;
}

export function supportsUnicodeEmojiVersion(
  unicodeVersion: string | undefined,
  androidSdkInt: number,
  androidSdkKnown: boolean,
): boolean {
  const version = parseUnicodeEmojiVersion(unicodeVersion);
  if (version >= 17) {
    if (!androidSdkKnown) {
      return true;
    }
    return androidSdkInt >= ANDROID_SDK_FOR_EMOJI_UNICODE_17;
  }
  return true;
}
