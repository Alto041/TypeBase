import React, {memo} from 'react';
import {StyleSheet, Text, View} from 'react-native';
import type {AlternatePopupGeometry} from '../keyAlternates';
import {useKeyboardTheme, useThemedStyles} from '../KeyboardThemeContext';
import type {KeyboardTheme} from '../theme';
import {keyboardAlternatePopupRadii} from '../theme';

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

  const {containerRadius, selectorRadius} = keyboardAlternatePopupRadii(
    theme,
    height,
    cellHeight,
  );
  const selectedCol = selectedIndex % columns;
  const selectedRow = Math.floor(selectedIndex / columns);
  const selectorLeft = padding + selectedCol * (cellWidth + gap);
  const selectorTop = padding + selectedRow * (cellHeight + gap);
  const selectorColor =
    theme.design === 'quivox' ? theme.letterKeyPressed : theme.modifierKeyPressed;

  const rowData: string[][] = [];
  for (let row = 0; row < rows; row += 1) {
    rowData.push(alternates.slice(row * columns, row * columns + columns));
  }

  return (
    <View
      pointerEvents="none"
      style={[
        styles.shell,
        {
          left,
          top,
          width,
          height,
          borderRadius: containerRadius,
        },
      ]}>
      <View
        style={[
          styles.container,
          {
            backgroundColor: theme.letterKey,
            borderRadius: containerRadius,
          },
        ]}>
        <View
          style={[
            styles.selector,
            {
              left: selectorLeft,
              top: selectorTop,
              width: cellWidth,
              height: cellHeight,
              borderRadius: selectorRadius,
              backgroundColor: selectorColor,
            },
          ]}
        />
        <View style={[styles.grid, {padding, gap}]}>
          {rowData.map((rowChars, rowIndex) => (
            <View
              key={`row-${rowIndex}`}
              style={[
                styles.row,
                {gap, marginBottom: rowIndex < rows - 1 ? gap : 0},
              ]}>
              {rowChars.map((char, colIndex) => {
                const index = rowIndex * columns + colIndex;
                return (
                  <View
                    key={`${char}-${index}`}
                    style={[styles.cell, {width: cellWidth, height: cellHeight}]}>
                    <Text
                      style={[
                        styles.cellLabel,
                        {
                          // Custom keyboard fonts often lack ö/ä/ü glyphs — fall
                          // back to the system UI font so umlauts always render.
                          color: theme.label,
                          fontFamily: undefined,
                        },
                      ]}>
                      {char ?? ''}
                    </Text>
                  </View>
                );
              })}
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

export const KeyAlternatePopup = memo(KeyAlternatePopupComponent);

function createStyles(_theme: KeyboardTheme) {
  return StyleSheet.create({
    shell: {
      position: 'absolute',
      zIndex: 100,
      overflow: 'hidden',
      elevation: 8,
      shadowColor: '#000',
      shadowOffset: {width: 0, height: 2},
      shadowOpacity: 0.2,
      shadowRadius: 4,
    },
    container: {
      flex: 1,
      overflow: 'hidden',
    },
    grid: {
      position: 'relative',
      zIndex: 1,
    },
    selector: {
      position: 'absolute',
      zIndex: 0,
      overflow: 'hidden',
    },
    row: {
      flexDirection: 'row',
    },
    cell: {
      alignItems: 'center',
      justifyContent: 'center',
    },
    cellLabel: {
      fontSize: 22,
      fontWeight: '500',
    },
  });
}
