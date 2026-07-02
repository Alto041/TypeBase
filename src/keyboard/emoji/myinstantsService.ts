/**
 * MyInstants sound browser via the community REST API.
 * @see README-sfx.md / https://github.com/abdipr/myinstants-api
 */
const MYINSTANTS_API_BASE = 'https://myinstants-api.vercel.app';

export const SFX_COLUMNS = 2;
export const SFX_PAGE_SIZE = 40;

export type MyInstantsSound = {
  id: string;
  title: string;
  url: string;
  mp3: string;
};

type MyInstantsListResponse = {
  // API returns status as a string ("200") in some responses, number in others.
  status: number | string;
  author?: string;
  message?: string;
  data?: MyInstantsSound[] | MyInstantsSound;
};

function normalizeSounds(
  data: MyInstantsListResponse['data'],
): MyInstantsSound[] {
  if (Array.isArray(data)) {
    return data.filter(s => Boolean(s?.id && s?.mp3));
  }
  if (data && typeof data === 'object' && data.id && data.mp3) {
    return [data];
  }
  return [];
}

/** API sends status as string or number; normalize before comparing. */
function isOkStatus(status: number | string | undefined): boolean {
  return String(status) === '200';
}

async function fetchSounds(path: string, params?: Record<string, string>): Promise<MyInstantsSound[]> {
  const search = params
    ? `?${new URLSearchParams(params).toString()}`
    : '';
  const response = await fetch(`${MYINSTANTS_API_BASE}${path}${search}`);
  if (!response.ok) {
    throw new Error(`MyInstants request failed (${response.status})`);
  }
  const json = (await response.json()) as MyInstantsListResponse;
  if (!isOkStatus(json.status)) {
    throw new Error(json.message ?? 'MyInstants request failed');
  }
  return normalizeSounds(json.data);
}

/** Trending meme sounds (region defaults to US). */
export function fetchTrendingSounds(region = 'us'): Promise<MyInstantsSound[]> {
  return fetchSounds('/trending', {q: region});
}

/** Search meme sounds by query. */
export function searchSounds(query: string): Promise<MyInstantsSound[]> {
  const trimmed = query.trim();
  if (!trimmed) {
    return fetchRecentSounds();
  }
  return fetchSounds('/search', {q: trimmed});
}

/** Recently uploaded sounds. */
export function fetchRecentSounds(): Promise<MyInstantsSound[]> {
  return fetchSounds('/recent');
}

export function chunkSounds<T>(
  items: readonly T[],
  columns = SFX_COLUMNS,
): T[][] {
  const rows: T[][] = [];
  for (let index = 0; index < items.length; index += columns) {
    rows.push(items.slice(index, index + columns) as T[]);
  }
  return rows;
}
