import type {StickerLyPack} from './stickerLyService';

export type StickerLySticker = {
  id: string;
  packId: string;
  packName: string;
  label: string;
  previewUrl: string;
  insertUrl: string;
  isAnimated: boolean;
};

/** @deprecated Use StickerLySticker */
export type KeyboardSticker = StickerLySticker;

export const STICKER_COLUMNS = 3;

export const ALL_STICKER_PACK_ID = '__all__';

export function stickersFromPack(pack: StickerLyPack): StickerLySticker[] {
  return pack.resourceFiles.map(file => ({
    id: `${pack.packId}-${file}`,
    packId: pack.packId,
    packName: pack.name,
    label: pack.name,
    previewUrl: `${pack.resourceUrlPrefix}${file}`,
    insertUrl: `${pack.resourceUrlPrefix}${file}`,
    isAnimated: pack.isAnimated,
  }));
}

export function stickersFromAllPacks(
  packs: readonly StickerLyPack[],
): StickerLySticker[] {
  const seen = new Set<string>();
  const merged: StickerLySticker[] = [];
  for (const pack of packs) {
    for (const sticker of stickersFromPack(pack)) {
      if (seen.has(sticker.id)) {
        continue;
      }
      seen.add(sticker.id);
      merged.push(sticker);
    }
  }
  return merged;
}

export function chunkStickers(
  stickers: readonly StickerLySticker[],
  columns = STICKER_COLUMNS,
): StickerLySticker[][] {
  const rows: StickerLySticker[][] = [];
  for (let index = 0; index < stickers.length; index += columns) {
    rows.push(stickers.slice(index, index + columns));
  }
  return rows;
}
