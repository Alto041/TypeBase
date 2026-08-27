/**
 * Merge Unicode Emoji 17.0 (Android 17) fully-qualified emojis into android_gboard_emojis.json
 * Source: https://www.unicode.org/Public/emoji/latest/emoji-test.txt
 */
import fs from 'fs';
import path from 'path';
import {fileURLToPath} from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const DATA_PATH = path.join(
  ROOT,
  'src/keyboard/emoji/data/android_gboard_emojis.json',
);
const ROOT_COPY_PATH = path.join(ROOT, 'android_gboard_emojis.json');
const EMOJI_TEST_URL = 'https://www.unicode.org/Public/emoji/latest/emoji-test.txt';

const GROUP_TO_CATEGORY = {
  'Smileys & Emotion': 'smileys_people',
  'People & Body': 'smileys_people',
  'Animals & Nature': 'animals_nature',
  'Food & Drink': 'food_drink',
  'Travel & Places': 'travel_places',
  'Activities': 'activities',
  'Objects': 'objects',
  'Symbols': 'symbols',
  'Flags': 'flags',
};

function codePointsToEmoji(hexParts) {
  return hexParts
    .map(hex => String.fromCodePoint(parseInt(hex, 16)))
    .join('');
}

function slugify(name) {
  return name
    .toLowerCase()
    .replace(/['']/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}

function hasSkinTone(name) {
  return /skin tone/i.test(name);
}

async function fetchEmojiTest() {
  const response = await fetch(EMOJI_TEST_URL);
  if (!response.ok) {
    throw new Error(`Failed to fetch emoji-test.txt (${response.status})`);
  }
  return response.text();
}

function parseEmojiTest(text) {
  let currentGroup = '';
  const categoryOrder = Object.fromEntries(
    Object.values(GROUP_TO_CATEGORY).map(id => [id, []]),
  );
  const emoji17Entries = [];

  for (const line of text.split('\n')) {
    const groupMatch = line.match(/^# group: (.+)$/);
    if (groupMatch) {
      currentGroup = groupMatch[1].trim();
      continue;
    }

    if (!line.includes('fully-qualified')) {
      continue;
    }

    const semiIndex = line.indexOf(';');
    const hashIndex = line.indexOf('#');
    if (semiIndex < 0 || hashIndex < 0) {
      continue;
    }

    const category = GROUP_TO_CATEGORY[currentGroup];
    if (!category) {
      continue;
    }

    const codePoints = line.slice(0, semiIndex).trim().split(/\s+/);
    const comment = line.slice(hashIndex + 1).trim();
    const versionMatch = comment.match(/\sE(\d+(?:\.\d+)?)\s+(.*)$/);
    if (!versionMatch) {
      continue;
    }

    const version = versionMatch[1];
    const name = versionMatch[2].trim();
    const emoji = codePointsToEmoji(codePoints);

    const entry = {
      category,
      emoji,
      name,
      slug: slugify(name),
      skin_tone_support: hasSkinTone(name),
      unicode_version: version,
    };

    categoryOrder[category].push(entry);

    if (version === '17.0') {
      emoji17Entries.push(entry);
    }
  }

  return {categoryOrder, emoji17Entries};
}

function insertInCldrOrder(categoryEmojis, additions, orderedCategory) {
  const emojiList = [...categoryEmojis];
  const indexByEmoji = new Map(emojiList.map((item, index) => [item.emoji, index]));
  const orderEmojis = orderedCategory.map(item => item.emoji);

  for (const entry of additions) {
    if (indexByEmoji.has(entry.emoji)) {
      continue;
    }

    const entryIndex = orderEmojis.indexOf(entry.emoji);
    let insertAt = emojiList.length;

    for (let i = entryIndex - 1; i >= 0; i -= 1) {
      const previousEmoji = orderEmojis[i];
      if (indexByEmoji.has(previousEmoji)) {
        insertAt = indexByEmoji.get(previousEmoji) + 1;
        break;
      }
    }

    const item = {
      emoji: entry.emoji,
      name: entry.name,
      slug: entry.slug,
      skin_tone_support: entry.skin_tone_support,
      unicode_version: entry.unicode_version,
    };

    emojiList.splice(insertAt, 0, item);

    indexByEmoji.clear();
    emojiList.forEach((item, index) => indexByEmoji.set(item.emoji, index));
  }

  return emojiList;
}

function refreshEmoji17Metadata(bundle, emoji17Entries) {
  const byEmoji = new Map(emoji17Entries.map(entry => [entry.emoji, entry]));

  for (const category of bundle.categories) {
    for (const item of category.emojis) {
      const source = byEmoji.get(item.emoji);
      if (!source) {
        continue;
      }
      item.name = source.name;
      item.slug = source.slug;
      item.skin_tone_support = source.skin_tone_support;
      item.unicode_version = source.unicode_version;
    }
  }
}

function mergeEntries(bundle, categoryOrder, emoji17Entries) {
  const existing = new Set(
    bundle.categories.flatMap(category => category.emojis.map(item => item.emoji)),
  );

  const toAdd = emoji17Entries.filter(entry => !existing.has(entry.emoji));
  if (toAdd.length === 0) {
    const allEmojis = bundle.categories.flatMap(category => category.emojis);
    return {added: 0, total: allEmojis.length};
  }

  const additionsByCategory = Object.groupBy(toAdd, entry => entry.category);

  for (const category of bundle.categories) {
    const additions = additionsByCategory[category.id] ?? [];
    if (additions.length === 0) {
      continue;
    }

    category.emojis = insertInCldrOrder(
      category.emojis,
      additions,
      categoryOrder[category.id] ?? [],
    );
    category.count = category.emojis.length;
  }

  const allEmojis = bundle.categories.flatMap(category => category.emojis);
  bundle.meta.total_emojis = allEmojis.length;

  return {added: toAdd.length, total: allEmojis.length};
}

const text = await fetchEmojiTest();
const {categoryOrder, emoji17Entries} = parseEmojiTest(text);
const bundle = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
refreshEmoji17Metadata(bundle, emoji17Entries);
const result = mergeEntries(bundle, categoryOrder, emoji17Entries);

const output = `${JSON.stringify(bundle, null, 2)}\n`;
fs.writeFileSync(DATA_PATH, output);
fs.writeFileSync(ROOT_COPY_PATH, output);

console.log(
  `Emoji 17.0: parsed ${emoji17Entries.length} fully-qualified entries, added ${result.added}, total ${result.total}`,
);
