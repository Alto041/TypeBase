import React, {memo} from 'react';
import {StyleSheet, Text, View} from 'react-native';
import type {AlternatePopupGeometry} from '../keyAlternates';
import {useKeyboardTheme, useThemedStyles} from '../KeyboardThemeContext';

export type AlternatePopupState = {
  alternates: string[];
  selectedIndex: number;
  geometry: AlternatePopupGeometry;
};

type KeyAlternatePopupProps = {
  popup: AlternatePopupState | null;
};

function KeyAlternatePopupComponent({popup}: KeyAlternatePopupProps) {
  const theme = useKeyboardTheme();
  const styles = useThemedStyles(createStyles);

  if (!popup) {
    return null;
  }

  const {alternates, selectedIndex, geometry} = popup;
  const {left, top, width, height, columns, rows, cellWidth, cellHeight, gap, padding} =
    geometry;

  const rowData: string[][] = [];
  for (let row = 0; row < rows; row += 1) {
    rowData.push(alternates.slice(row * columns, row * columns + columns));
  }

  return (
    <View
      pointerEvents="none"
      style={[
        styles.container,
        {
          left,
          top,
          width,
          height,
          borderRadius: theme.keyRadius + 2,
          backgroundColor: theme.letterKey,
          padding,
        },
      ]}>
      {rowData.map((rowChars, rowIndex) => (
        <View key={`row-${rowIndex}`} style={[styles.row, {gap, marginBottom: rowIndex < rows - 1 ? gap : 0}]}>
          {rowChars.map((char, colIndex) => {
            const index = rowIndex * columns + colIndex;
            const selected = index === selectedIndex;
            return (
              <View
                key={`${char}-${index}`}
                style={[
                  styles.cell,
                  {
                    width: cellWidth,
                    height: cellHeight,
                    borderRadius: theme.keyRadius,
                    backgroundColor: selected ? theme.modifierKeyPressed : 'transparent',
                  },
                ]}>
                <Text style={[styles.cellLabel, {color: theme.label}]}>{char}</Text>
              </View>
            );
          })}
        </View>
      ))}
    </View>
  );
}

export const KeyAlternatePopup = memo(KeyAlternatePopupComponent);

function createStyles() {
  return StyleSheet.create({
    container: {
      position: 'absolute',
      zIndex: 100,
      elevation: 8,
      shadowColor: '#000',
      shadowOffset: {width: 0, height: 2},
      shadowOpacity: 0.2,
      shadowRadius: 4,
    },
    row: {
      flexDirection: 'row',
    },
    cell: {
      alignItems: 'center',
      justifyContent: 'center',
    },
    cellLabel: {
      fontFamily: 'Geist',
      fontSize: 22,
      fontWeight: '500',
    },
  });
}
