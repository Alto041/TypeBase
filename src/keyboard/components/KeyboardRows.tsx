import React, {memo} from 'react';
import {StyleSheet, View, type StyleProp, type ViewStyle} from 'react-native';
import type {KeyDefinition} from '../layouts/qwerty';
import {useThemedStyles} from '../KeyboardThemeContext';
import type {KeyboardTheme} from '../theme';
import {BackspaceKey} from './BackspaceKey';
import {isBackspaceKeyType, isGesturePunctuationKey} from './keyboardRowLayout';
import {Key, type KeyGesturesConfig, type KeyVariant} from './Key';
import {PunctuationKey} from './PunctuationKey';

type SharedRowProps = {
  isUppercase: boolean;
  isShiftOn: boolean;
  isCapsLocked: boolean;
  onKeyPress: (keyDef: KeyDefinition) => void;
  keyGestures?: KeyGesturesConfig;
  keyHeight?: number;
  variant?: KeyVariant;
  rowStyle?: StyleProp<ViewStyle>;
};

type KeyboardRowProps = SharedRowProps & {
  keys: KeyDefinition[];
};

function renderRowKey(
  keyDef: KeyDefinition,
  props: SharedRowProps,
  style: StyleProp<ViewStyle>,
) {
  if (isBackspaceKeyType(keyDef)) {
    return (
      <BackspaceKey
        key={keyDef.id}
        keyDef={keyDef}
        onPress={props.onKeyPress}
        keyGestures={props.keyGestures}
        keyHeight={props.keyHeight}
        style={style}
      />
    );
  }

  if (isGesturePunctuationKey(keyDef)) {
    return (
      <PunctuationKey
        key={keyDef.id}
        keyDef={keyDef}
        onPress={props.onKeyPress}
        keyGestures={props.keyGestures}
        keyHeight={props.keyHeight}
        style={style}
      />
    );
  }

  return (
    <Key
      key={keyDef.id}
      keyDef={keyDef}
      isUppercase={props.isUppercase}
      isShiftOn={props.isShiftOn}
      isCapsLocked={props.isCapsLocked}
      onPress={props.onKeyPress}
      keyGestures={props.keyGestures}
      keyHeight={props.keyHeight}
      variant={props.variant}
      style={style}
    />
  );
}

function KeyboardRowComponent({
  keys,
  isUppercase,
  isShiftOn,
  isCapsLocked,
  onKeyPress,
  keyGestures,
  keyHeight,
  variant,
  rowStyle,
}: KeyboardRowProps) {
  const styles = useThemedStyles(createRowStyles);
  const shared: SharedRowProps = {
    isUppercase,
    isShiftOn,
    isCapsLocked,
    onKeyPress,
    keyGestures,
    keyHeight,
    variant,
    rowStyle,
  };

  return (
    <View style={[styles.row, rowStyle]}>
      {keys.map(keyDef =>
        keyDef.type === 'spacer' ? (
          <View key={keyDef.id} style={{flex: keyDef.flex ?? 1}} />
        ) : (
          renderRowKey(keyDef, shared, {flex: keyDef.flex ?? 1, minWidth: 0})
        ),
      )}
    </View>
  );
}

export const KeyboardRow = memo(KeyboardRowComponent);

export function renderKeyboardRow(
  keys: KeyDefinition[],
  index: number,
  layoutKey: string,
  props: SharedRowProps,
) {
  return (
    <KeyboardRow key={`${layoutKey}-row-${index}`} keys={keys} {...props} />
  );
}

function createRowStyles(theme: KeyboardTheme) {
  return StyleSheet.create({
    row: {
      flexDirection: 'row',
      gap: theme.keyGap,
      marginBottom: theme.keyRowMargin,
      paddingHorizontal: theme.keyRowPaddingHorizontal,
      alignItems: 'stretch',
    },
  });
}
