import gboardEmojiBundle from './data/android_gboard_emojis.json';

type GboardEmojiEntry = {
  emoji: string;
  name: string;
  slug: string;
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

export const GBOARD_EMOJIS_BY_CATEGORY = Object.fromEntries(
  bundle.categories.map(category => [
    category.id,
    category.emojis.map(entry => entry.emoji),
  ]),
) as Record<string, readonly string[]>;

const SEARCH_INDEX = bundle.categories.flatMap(category =>
  category.emojis.map(entry => ({
    emoji: entry.emoji,
    name: entry.name.toLowerCase(),
    slug: entry.slug.toLowerCase(),
  })),
);

export function searchEmojis(query: string, limit = 180): string[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return [];
  }

  const terms = normalized.split(/\s+/).filter(Boolean);
  const results: string[] = [];
  const seen = new Set<string>();

  for (const entry of SEARCH_INDEX) {
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
