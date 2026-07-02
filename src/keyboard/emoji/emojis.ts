import type {FC} from 'react';
import type {SvgProps} from 'react-native-svg';
import GifIcon from '../../../assets/gif.svg';
import SfxIcon from '../../../assets/sfx.svg';
import FlagIcon from '../../../assets/emojiCategories/flag.svg';
import ForkSpoonIcon from '../../../assets/emojiCategories/fork_spoon.svg';
import GlyphsIcon from '../../../assets/emojiCategories/glyphs.svg';
import LanguageIcon from '../../../assets/emojiCategories/language.svg';
import MoodIcon from '../../../assets/emojiCategories/mood.svg';
import ObjectsIcon from '../../../assets/emojiCategories/desktop_windows.svg';
import ParkIcon from '../../../assets/emojiCategories/park.svg';
import TravelIcon from '../../../assets/emojiCategories/travel.svg';
import {
  GBOARD_EMOJI_CATEGORY_ORDER,
  GBOARD_EMOJIS_BY_CATEGORY,
} from './gboardEmojiData';

export const EMOJI_COLUMNS = 9;

export type EmojiCategoryId =
  | 'smileys_people'
  | 'animals_nature'
  | 'food_drink'
  | 'travel_places'
  | 'activities'
  | 'objects'
  | 'symbols'
  | 'flags'
  | 'gif'
  | 'sfx';

type EmojiCategoryConfig = {
  id: EmojiCategoryId;
  Icon: FC<SvgProps>;
};

const EMOJI_CATEGORY_ICONS: Record<
  Exclude<EmojiCategoryId, 'gif' | 'sfx'>,
  FC<SvgProps>
> = {
  smileys_people: MoodIcon,
  animals_nature: ParkIcon,
  food_drink: ForkSpoonIcon,
  travel_places: TravelIcon,
  activities: LanguageIcon,
  objects: ObjectsIcon,
  symbols: GlyphsIcon,
  flags: FlagIcon,
};

export const EMOJI_CATEGORIES: EmojiCategoryConfig[] = [
  ...GBOARD_EMOJI_CATEGORY_ORDER.map(id => ({
    id: id as Exclude<EmojiCategoryId, 'gif' | 'sfx'>,
    Icon: EMOJI_CATEGORY_ICONS[id as Exclude<EmojiCategoryId, 'gif' | 'sfx'>],
  })),
  {id: 'gif', Icon: GifIcon},
  {id: 'sfx', Icon: SfxIcon},
];

export const EMOJIS_BY_CATEGORY: Record<
  Exclude<EmojiCategoryId, 'gif' | 'sfx'>,
  readonly string[]
> = {
  smileys_people: GBOARD_EMOJIS_BY_CATEGORY.smileys_people ?? [],
  animals_nature: GBOARD_EMOJIS_BY_CATEGORY.animals_nature ?? [],
  food_drink: GBOARD_EMOJIS_BY_CATEGORY.food_drink ?? [],
  travel_places: GBOARD_EMOJIS_BY_CATEGORY.travel_places ?? [],
  activities: GBOARD_EMOJIS_BY_CATEGORY.activities ?? [],
  objects: GBOARD_EMOJIS_BY_CATEGORY.objects ?? [],
  symbols: GBOARD_EMOJIS_BY_CATEGORY.symbols ?? [],
  flags: GBOARD_EMOJIS_BY_CATEGORY.flags ?? [],
};

export const DEFAULT_EMOJI_CATEGORY: Exclude<EmojiCategoryId, 'gif' | 'sfx'> =
  'smileys_people';

export function getEmojisForCategory(
  category: Exclude<EmojiCategoryId, 'gif' | 'sfx'>,
): readonly string[] {
  return EMOJIS_BY_CATEGORY[category];
}

export function chunkEmojis(
  emojis: readonly string[],
  columns = EMOJI_COLUMNS,
): string[][] {
  const rows: string[][] = [];
  for (let index = 0; index < emojis.length; index += columns) {
    rows.push(emojis.slice(index, index + columns));
  }
  return rows;
}

export const EMOJI_ROWS_BY_CATEGORY = Object.fromEntries(
  EMOJI_CATEGORIES.filter(({id}) => id !== 'gif' && id !== 'sfx').map(({id}) => [
    id,
    chunkEmojis(EMOJIS_BY_CATEGORY[id as Exclude<EmojiCategoryId, 'gif' | 'sfx'>], EMOJI_COLUMNS),
  ]),
) as Record<Exclude<EmojiCategoryId, 'gif' | 'sfx'>, readonly (readonly string[])[]>;

export function getEmojiRowsForCategory(
  category: Exclude<EmojiCategoryId, 'gif' | 'sfx'>,
): readonly (readonly string[])[] {
  return EMOJI_ROWS_BY_CATEGORY[category];
}
