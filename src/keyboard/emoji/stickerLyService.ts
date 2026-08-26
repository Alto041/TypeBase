/**
 * Unofficial Sticker.ly API client (same endpoints as the `sticker.ly` npm package).
 * @see https://github.com/theabbie/sticker.ly
 * @see https://www.npmjs.com/package/sticker.ly
 */
const STICKERLY_API_ROOT = 'http://api.sticker.ly/v3.1';
const STICKERLY_USER_AGENT =
  'androidapp.stickerly/1.13.3 (G011A; U; Android 22; pt-BR; br;)';

const STICKERLY_HEADERS = {
  'User-Agent': STICKERLY_USER_AGENT,
  Host: 'api.sticker.ly',
} as const;

type StickerLyApiError = {
  error?: {
    errorCode?: string;
    errorMessage?: string;
  };
};

type StickerLyPackApi = {
  packId?: string;
  name?: string;
  authorName?: string;
  resourceUrlPrefix?: string;
  resourceFiles?: string[];
  shareUrl?: string;
  isAnimated?: boolean;
  animated?: boolean;
  stickers?: Array<{
    fileName?: string;
    sid?: string;
    isAnimated?: boolean;
    animated?: boolean;
  }>;
};

type StickerLyRecommendResponse = StickerLyApiError & {
  result?: {
    packs?: StickerLyPackApi[];
  };
};

type StickerLyPackResponse = StickerLyApiError & {
  result?: StickerLyPackApi;
};

export type StickerLyPack = {
  packId: string;
  name: string;
  authorName: string;
  resourceUrlPrefix: string;
  resourceFiles: readonly string[];
  shareUrl: string;
  isAnimated: boolean;
};

export const STICKERLY_RECOMMEND_PAGE_SIZE = 40;

async function fetchStickerLyJson<T>(path: string): Promise<T> {
  const response = await fetch(`${STICKERLY_API_ROOT}${path}`, {
    headers: STICKERLY_HEADERS,
  });
  if (!response.ok) {
    throw new Error(`Sticker.ly request failed (${response.status})`);
  }

  const json = (await response.json()) as T & StickerLyApiError;
  if (json.error?.errorCode) {
    throw new Error(
      json.error.errorMessage?.trim() ||
        `Sticker.ly error ${json.error.errorCode}`,
    );
  }

  return json;
}

function normalizePack(pack: StickerLyPackApi): StickerLyPack | null {
  const packId = pack.packId?.trim().toUpperCase();
  const resourceUrlPrefix = pack.resourceUrlPrefix?.trim();
  if (!packId || !resourceUrlPrefix) {
    return null;
  }

  const resourceFiles =
    pack.resourceFiles?.filter(Boolean) ??
    pack.stickers?.map(sticker => sticker.fileName).filter(Boolean) ??
    [];

  if (resourceFiles.length === 0) {
    return null;
  }

  return {
    packId,
    name: pack.name?.trim() || packId,
    authorName: pack.authorName?.trim() || 'Sticker.ly',
    resourceUrlPrefix: resourceUrlPrefix.endsWith('/')
      ? resourceUrlPrefix
      : `${resourceUrlPrefix}/`,
    resourceFiles,
    shareUrl: pack.shareUrl?.trim() || `https://sticker.ly/s/${packId}`,
    isAnimated: Boolean(pack.isAnimated || pack.animated),
  };
}

/** Mirrors `sticker.ly` npm `getStickers` (overview feed). */
export async function fetchStickerLyOverview(size = 30): Promise<unknown> {
  const json = await fetchStickerLyJson<{result?: unknown}>(
    `/status/overview?size=${size}`,
  );
  return json.result;
}

export async function fetchRecommendedStickerPacks(
  size = STICKERLY_RECOMMEND_PAGE_SIZE,
): Promise<StickerLyPack[]> {
  const json = await fetchStickerLyJson<StickerLyRecommendResponse>(
    `/stickerPack/recommend?size=${size}`,
  );
  const packs = json.result?.packs ?? [];
  return packs
    .slice(0, size)
    .map(normalizePack)
    .filter((pack): pack is StickerLyPack => pack != null);
}

export async function fetchStickerPackById(
  packId: string,
): Promise<StickerLyPack | null> {
  const normalized = packId.trim().toUpperCase();
  if (!normalized) {
    return null;
  }

  const json = await fetchStickerLyJson<StickerLyPackResponse>(
    `/stickerPack/${normalized}`,
  );
  return json.result ? normalizePack(json.result) : null;
}

export function parseStickerLyPackId(input: string): string | null {
  const trimmed = input.trim();
  const shareMatch = trimmed.match(
    /(?:https?:\/\/)?(?:www\.)?sticker\.ly\/s\/([A-Za-z0-9]+)/i,
  );
  if (shareMatch?.[1]) {
    return shareMatch[1].toUpperCase();
  }
  if (/^[A-Za-z0-9]{4,12}$/.test(trimmed)) {
    return trimmed.toUpperCase();
  }
  return null;
}
