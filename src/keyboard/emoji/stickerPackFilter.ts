import type {StickerLyPack} from './stickerLyService';
import type {StickerLySticker} from './stickers';

/** Pack title/author phrases we do not surface in the sticker tab. */
const BLOCKED_PACK_PATTERNS: RegExp[] = [
  /\bgirls?\b/,
  /\bgurls?\b/,
  /\bwaifu\b/,
  /\bhusbando\b/,
  /\banime\s+girls?\b/,
  /\banime\s+waifu\b/,
  /\bsexy\b/,
  /\bhot\s+girls?\b/,
  /\bpretty\s+girls?\b/,
  /\bbeautiful\s+girls?\b/,
  /\bbikini\b/,
  /\blingerie\b/,
  /\bnsfw\b/,
  /\bchicas?\b/,
  /\bgarotas?\b/,
  /\bmeninas?\b/,
  /\bgirlfriend\b/,
  /\bmulher\s+gostosa\b/,
  /\bmodel\b.*\bgirl\b/,
  /\bgirl\b.*\bmodel\b/,
  /\bkpop\s+girls?\b/,
  /\bidol\s+girls?\b/,
];

/** Prefer reaction / meme / mascot packs suitable for everyday chat. */
const FUN_CHAT_PACK_PATTERNS: RegExp[] = [
  /\bmeme\b/,
  /\bfunn?y\b/,
  /\blol\b/,
  /\breaction/,
  /\bemoji\b/,
  /\bcat\b/,
  /\bdog\b/,
  /\bpuppy\b/,
  /\bkitten\b/,
  /\bbear\b/,
  /\bfox\b/,
  /\banimal/,
  /\bpet\b/,
  /\bcute\b/,
  /\bmood\b/,
  /\bvibe\b/,
  /\bsarcas/,
  /\broast\b/,
  /\bthumbs?\b/,
  /\bok\b/,
  /\bface\b/,
  /\bstickers?\b/,
  /\bchat\b/,
  /\bwhatsapp\b/,
  /\btelegram\b/,
];

function packHaystack(pack: Pick<StickerLyPack, 'name' | 'authorName'>): string {
  return `${pack.name} ${pack.authorName}`.toLowerCase();
}

export function isBlockedStickerPack(
  pack: Pick<StickerLyPack, 'name' | 'authorName'>,
): boolean {
  const haystack = packHaystack(pack);
  return BLOCKED_PACK_PATTERNS.some(pattern => pattern.test(haystack));
}

export function isFunChatStickerPack(
  pack: Pick<StickerLyPack, 'name' | 'authorName'>,
): boolean {
  if (isBlockedStickerPack(pack)) {
    return false;
  }
  const haystack = packHaystack(pack);
  return FUN_CHAT_PACK_PATTERNS.some(pattern => pattern.test(haystack));
}

/** Chat-safe packs: not blocked; fun-tagged when possible. */
export function filterStickerPacksForChat(
  packs: readonly StickerLyPack[],
): StickerLyPack[] {
  const safe = packs.filter(pack => !isBlockedStickerPack(pack));
  const fun = safe.filter(isFunChatStickerPack);
  if (fun.length >= 4) {
    return fun;
  }
  return safe;
}

export function isChatSafeSticker(sticker: StickerLySticker): boolean {
  return !isBlockedStickerPack({
    name: sticker.packName,
    authorName: sticker.label,
  });
}

export function filterStickersForChat(
  stickers: readonly StickerLySticker[],
): StickerLySticker[] {
  return stickers.filter(isChatSafeSticker);
}
