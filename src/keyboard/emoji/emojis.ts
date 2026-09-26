import type {FC} from 'react';
import type {SvgProps} from 'react-native-svg';
import EmojiIcon from '../../../assets/emoji.svg';
import GifIcon from '../../../assets/gif.svg';
import SfxIcon from '../../../assets/sfx.svg';
import StickerIcon from '../../../assets/sticker.svg';
import FlagIcon from '../../../assets/emojiCategories/flag.svg';
import ForkSpoonIcon from '../../../assets/emojiCategories/fork_spoon.svg';
import LanguageIcon from '../../../assets/emojiCategories/language.svg';
import MoodIcon from '../../../assets/emojiCategories/mood.svg';
import ObjectsIcon from '../../../assets/emojiCategories/desktop_windows.svg';
import ParkIcon from '../../../assets/emojiCategories/park.svg';
import PersonIcon from '../../../assets/emojiCategories/person.svg';
import TravelIcon from '../../../assets/emojiCategories/travel.svg';
import {
  GBOARD_EMOJI_CATEGORY_ORDER,
  getGboardEmojisByCategoryId,
} from './gboardEmojiData';

export const EMOJI_COLUMNS = 9;

export type EmojiPanelTab = 'emojis' | 'gif' | 'stickers' | 'sfx';

export type EmojiSubcategoryId =
  | 'smileys_people'
  | 'animals_nature'
  | 'food_drink'
  | 'travel_places'
  | 'activities'
  | 'objects'
  | 'symbols'
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
  travel_places: TravelIcon,
  activities: PersonIcon,
  objects: ObjectsIcon,
  symbols: LanguageIcon,
  flags: FlagIcon,
};

/** Maps old 6-tab ids to the 8 Gboard category ids. */
const LEGACY_EMOJI_SUBCATEGORY_IDS: Record<string, EmojiSubcategoryId> = {
  travel_activities: 'travel_places',
  objects_symbols: 'objects',
};

const VALID_SUBCATEGORY_IDS = new Set<string>(GBOARD_EMOJI_CATEGORY_ORDER);

export function normalizeEmojiSubcategoryId(
  id: string,
): EmojiSubcategoryId {
  const legacy = LEGACY_EMOJI_SUBCATEGORY_IDS[id];
  if (legacy) {
    return legacy;
  }
  if (VALID_SUBCATEGORY_IDS.has(id)) {
    return id as EmojiSubcategoryId;
  }
  return DEFAULT_EMOJI_SUBCATEGORY;
}

export const EMOJI_PANEL_TABS: PanelTabConfig[] = [
  {id: 'emojis', Icon: EmojiIcon},
  {id: 'gif', Icon: GifIcon},
  {id: 'stickers', Icon: StickerIcon},
  {id: 'sfx', Icon: SfxIcon},
];

export const EMOJI_SUBCATEGORIES: EmojiSubcategoryConfig[] =
  GBOARD_EMOJI_CATEGORY_ORDER.map(id => ({
    id: id as EmojiSubcategoryId,
    Icon: EMOJI_SUBCATEGORY_ICONS[id as EmojiSubcategoryId],
  }));

export const DEFAULT_EMOJI_PANEL_TAB: EmojiPanelTab = 'emojis';
export const DEFAULT_EMOJI_SUBCATEGORY: EmojiSubcategoryId = 'smileys_people';

export function getEmojisForCategory(
  category: EmojiSubcategoryId,
): readonly string[] {
  return getGboardEmojisByCategoryId(category);
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

export function getEmojiRowsForCategory(
  category: EmojiSubcategoryId,
): readonly (readonly string[])[] {
  return chunkEmojis(getEmojisForCategory(category), EMOJI_COLUMNS);
}
