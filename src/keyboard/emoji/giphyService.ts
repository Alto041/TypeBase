const GIPHY_API_KEY = '1BYw4Y1xcGxl3brCaSgfTIGjK77RzhtQ';
const GIPHY_BASE_URL = 'https://api.giphy.com/v1/gifs';

export const GIF_COLUMNS = 2;
export const GIF_PAGE_SIZE = 24;

type GiphyImageRendition = {
  url: string;
  width: string;
  height: string;
};

export type GiphyGif = {
  id: string;
  title: string;
  images: {
    fixed_width_small?: GiphyImageRendition;
    fixed_width_small_still?: GiphyImageRendition;
    downsized?: GiphyImageRendition;
    original?: GiphyImageRendition;
  };
};

type GiphyListResponse = {
  data: GiphyGif[];
  pagination?: {
    total_count?: number;
    count?: number;
    offset?: number;
  };
  meta?: {
    status: number;
    msg: string;
  };
};

const GIF_FIELDS =
  'id,title,images.fixed_width_small,images.fixed_width_small_still,images.downsized,images.original';

function buildUrl(path: string, params: Record<string, string | number>): string {
  const search = new URLSearchParams({
    api_key: GIPHY_API_KEY,
    rating: 'g',
    limit: String(GIF_PAGE_SIZE),
    fields: GIF_FIELDS,
    ...Object.fromEntries(
      Object.entries(params).map(([key, value]) => [key, String(value)]),
    ),
  });
  return `${GIPHY_BASE_URL}/${path}?${search.toString()}`;
}

async function fetchGifs(url: string): Promise<GiphyListResponse> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`GIPHY request failed (${response.status})`);
  }

  const json = (await response.json()) as GiphyListResponse;
  if (json.meta?.status !== 200) {
    throw new Error(json.meta?.msg ?? 'GIPHY request failed');
  }

  return json;
}

export function getGifPreviewUrl(gif: GiphyGif): string | null {
  return (
    gif.images.fixed_width_small?.url ??
    gif.images.fixed_width_small_still?.url ??
    gif.images.downsized?.url ??
    gif.images.original?.url ??
    null
  );
}

export function getGifInsertUrl(gif: GiphyGif): string | null {
  return (
    gif.images.downsized?.url ??
    gif.images.original?.url ??
    gif.images.fixed_width_small?.url ??
    null
  );
}

export async function fetchTrendingGifs(offset = 0): Promise<GiphyGif[]> {
  const url = buildUrl('trending', {offset});
  const json = await fetchGifs(url);
  return json.data ?? [];
}

export async function searchGifs(query: string, offset = 0): Promise<GiphyGif[]> {
  const trimmed = query.trim();
  if (!trimmed) {
    return fetchTrendingGifs(offset);
  }

  const url = buildUrl('search', {q: trimmed, offset});
  const json = await fetchGifs(url);
  return json.data ?? [];
}

export function chunkGifs(
  gifs: readonly GiphyGif[],
  columns = GIF_COLUMNS,
): GiphyGif[][] {
  const rows: GiphyGif[][] = [];
  for (let index = 0; index < gifs.length; index += columns) {
    rows.push(gifs.slice(index, index + columns));
  }
  return rows;
}
