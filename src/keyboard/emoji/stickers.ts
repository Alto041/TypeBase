import type {ImageSourcePropType} from 'react-native';

export type KeyboardSticker = {
  id: string;
  label: string;
  filename: string;
  source: ImageSourcePropType;
};

/** Curated bundled stickers from assets/stickers/. */
export const KEYBOARD_STICKERS: readonly KeyboardSticker[] = [
  {
    id: 'aura',
    label: 'aura',
    filename: 'aura.jfif',
    source: require('../../../assets/stickers/aura.jfif'),
  },
  {
    id: 'bro-what',
    label: 'Bro What',
    filename: 'bro-what.jpg',
    source: require('../../../assets/stickers/bro-what.jpg'),
  },
  {
    id: 'aaaaaaaa',
    label: 'AAAAAAAA',
    filename: 'AAAAAAAA.jpg',
    source: require('../../../assets/stickers/AAAAAAAA.jpg'),
  },
  {
    id: 'broke',
    label: 'broke',
    filename: 'broke.jpg',
    source: require('../../../assets/stickers/broke.jpg'),
  },
  {
    id: 'dance',
    label: 'dance',
    filename: 'dance.jfif',
    source: require('../../../assets/stickers/dance.jfif'),
  },
  {
    id: 'please',
    label: 'please',
    filename: 'please.jpg',
    source: require('../../../assets/stickers/please.jpg'),
  },
  {
    id: 'sigma',
    label: 'sigma',
    filename: 'sigma.jpg',
    source: require('../../../assets/stickers/sigma.jpg'),
  },
  {
    id: 'sus',
    label: 'sus',
    filename: 'sus.jfif',
    source: require('../../../assets/stickers/sus.jfif'),
  },
  {
    id: 'teacher-not-looking',
    label: 'The teacher not looking',
    filename: 'teacher-not-looking.jfif',
    source: require('../../../assets/stickers/teacher-not-looking.jfif'),
  },
  {
    id: 'w-putin',
    label: 'w putin',
    filename: 'w-putin.jfif',
    source: require('../../../assets/stickers/w-putin.jfif'),
  },
];

export const STICKER_COLUMNS = 3;

export function chunkStickers(
  stickers: readonly KeyboardSticker[],
  columns = STICKER_COLUMNS,
): KeyboardSticker[][] {
  const rows: KeyboardSticker[][] = [];
  for (let index = 0; index < stickers.length; index += columns) {
    rows.push(stickers.slice(index, index + columns));
  }
  return rows;
}
