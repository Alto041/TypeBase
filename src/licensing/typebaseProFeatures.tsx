import React from 'react';

import AiConfigBlackIcon from '../../assets/Artificial.svg';
import GestureIcon from '../../assets/gesture.svg';
import ItemsIcon from '../../assets/items.svg';
import PersonalIcon from '../../assets/personal.svg';
import StickersIcon from '../../assets/sticker.svg';
import ThemesIcon from '../../assets/themes.svg';

const PRO_ICON = 22;

export const TYPEBASE_PRO_FEATURES = [
  {
    key: 'plugins',
    name: 'Keyboard plugins',
    desc: 'Format, clipboard, calculator, and more in one tap.',
  },
  {
    key: 'themes',
    name: 'Themes & styling',
    desc: 'Premium themes and deep keyboard customization.',
  },
  {
    key: 'gestures',
    name: 'Gestures & swipe typing',
    desc: 'Glide across keys and use gesture shortcuts.',
  },
  {
    key: 'myrow',
    name: 'My Row & essentials',
    desc: 'Adaptive symbols and shortcuts on your row.',
  },
  {
    key: 'ai',
    name: 'AI toolkit',
    desc: 'Translate, rewrite, and voice — on your terms.',
  },
  {
    key: 'stickers',
    name: 'Stickers & sound',
    desc: 'Sticker packs and typing sound effects.',
  },
] as const;

export type TypebaseProFeatureKey = (typeof TYPEBASE_PRO_FEATURES)[number]['key'];

export function renderTypebaseProIcon(
  key: TypebaseProFeatureKey,
  iconColor: string,
): React.ReactElement {
  switch (key) {
    case 'plugins':
      return <ItemsIcon width={PRO_ICON} height={PRO_ICON} color={iconColor} />;
    case 'themes':
      return <ThemesIcon width={PRO_ICON} height={PRO_ICON} color={iconColor} />;
    case 'gestures':
      return <GestureIcon width={PRO_ICON} height={PRO_ICON} color={iconColor} />;
    case 'myrow':
      return <PersonalIcon width={PRO_ICON} height={PRO_ICON} color={iconColor} />;
    case 'ai':
      return (
        <AiConfigBlackIcon width={PRO_ICON} height={PRO_ICON} color={iconColor} />
      );
    case 'stickers':
      return <StickersIcon width={PRO_ICON} height={PRO_ICON} color={iconColor} />;
  }
}
