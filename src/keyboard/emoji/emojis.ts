import type {FC} from 'react';
import type {SvgProps} from 'react-native-svg';
import EmojiIcon from '../../../assets/emoji.svg';
import GifIcon from '../../../assets/gif.svg';
import SfxIcon from '../../../assets/sfx.svg';
import StickerIcon from '../../../assets/sticker.svg';
import FlagIcon from '../../../assets/emojiCategories/flag.svg';
import ForkSpoonIcon from '../../../assets/emojiCategories/fork_spoon.svg';
import MoodIcon from '../../../assets/emojiCategories/mood.svg';
import ObjectsIcon from '../../../assets/emojiCategories/desktop_windows.svg';
import ParkIcon from '../../../assets/emojiCategories/park.svg';
import TravelIcon from '../../../assets/emojiCategories/travel.svg';
import {GBOARD_EMOJIS_BY_CATEGORY} from './gboardEmojiData';

export const EMOJI_COLUMNS = 9;

export type EmojiPanelTab = 'emojis' | 'gif' | 'stickers' | 'sfx';

export type EmojiSubcategoryId =
  | 'smileys_people'
  | 'animals_nature'
  | 'food_drink'
  | 'travel_activities'
  | 'objects_symbols'
  | 'flags';

type PanelTabConfig = {
  id: EmojiPanelTab;
  Icon: FC<SvgProps>;
};

type EmojiSubcategoryConfig = {
  id: EmojiSubcategoryId;
  Icon: FC<SvgProps>;
};

const EMOJI_SUBCATEGORY_ICONS: Record<EmojiSubcategoryId, FC<SvgProps>> = {
  smileys_people: MoodIcon,
  animals_nature: ParkIcon,
  food_drink: ForkSpoonIcon,
  travel_activities: TravelIcon,
  objects_symbols: ObjectsIcon,
  flags: FlagIcon,
};

export const EMOJI_PANEL_TABS: PanelTabConfig[] = [
  {id: 'emojis', Icon: EmojiIcon},
  {id: 'gif', Icon: GifIcon},
  {id: 'stickers', Icon: StickerIcon},
  {id: 'sfx', Icon: SfxIcon},
];

export const EMOJI_SUBCATEGORIES: EmojiSubcategoryConfig[] = [
  {id: 'smileys_people', Icon: EMOJI_SUBCATEGORY_ICONS.smileys_people},
  {id: 'animals_nature', Icon: EMOJI_SUBCATEGORY_ICONS.animals_nature},
  {id: 'food_drink', Icon: EMOJI_SUBCATEGORY_ICONS.food_drink},
  {id: 'travel_activities', Icon: EMOJI_SUBCATEGORY_ICONS.travel_activities},
  {id: 'objects_symbols', Icon: EMOJI_SUBCATEGORY_ICONS.objects_symbols},
  {id: 'flags', Icon: EMOJI_SUBCATEGORY_ICONS.flags},
];

export const EMOJIS_BY_CATEGORY: Record<EmojiSubcategoryId, readonly string[]> = {
  smileys_people: GBOARD_EMOJIS_BY_CATEGORY.smileys_people ?? [],
  animals_nature: GBOARD_EMOJIS_BY_CATEGORY.animals_nature ?? [],
  food_drink: GBOARD_EMOJIS_BY_CATEGORY.food_drink ?? [],
  travel_activities: [
    ...(GBOARD_EMOJIS_BY_CATEGORY.travel_places ?? []),
    ...(GBOARD_EMOJIS_BY_CATEGORY.activities ?? []),
  ],
  objects_symbols: [
    ...(GBOARD_EMOJIS_BY_CATEGORY.objects ?? []),
    ...(GBOARD_EMOJIS_BY_CATEGORY.symbols ?? []),
  ],
  flags: GBOARD_EMOJIS_BY_CATEGORY.flags ?? [],
};

export const DEFAULT_EMOJI_PANEL_TAB: EmojiPanelTab = 'emojis';
export const DEFAULT_EMOJI_SUBCATEGORY: EmojiSubcategoryId = 'smileys_people';

export function getEmojisForCategory(
  category: EmojiSubcategoryId,
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
  EMOJI_SUBCATEGORIES.map(({id}) => [
    id,
    chunkEmojis(EMOJIS_BY_CATEGORY[id], EMOJI_COLUMNS),
  ]),
) as Record<EmojiSubcategoryId, readonly (readonly string[])[]>;

export function getEmojiRowsForCategory(
  category: EmojiSubcategoryId,
): readonly (readonly string[])[] {
  return EMOJI_ROWS_BY_CATEGORY[category];
}
