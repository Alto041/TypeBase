import React, {useRef, useState} from 'react';
import {
  Animated,
  Easing,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import DeleteIcon from '../../../assets/delete.svg';
import {useKeyboardTheme, useThemedStyles} from '../KeyboardThemeContext';
import {triggerKeyHaptic} from '../haptics';
import type {KeyboardTheme} from '../theme';
import type {Essential} from './types';

const ACTION_WIDTH = 72;

type EssentialsSwipeRowProps = {
  essential: Essential;
  tileStyle?: StyleProp<ViewStyle>;
  onSelect: (essential: Essential) => void;
  onDelete: (essential: Essential) => void;
};

export function EssentialsSwipeRow({
  essential,
  tileStyle,
  onSelect,
  onDelete,
}: EssentialsSwipeRowProps) {
  const theme = useKeyboardTheme();
  const styles = useThemedStyles(createEssentialsSwipeStyles);
  const translateX = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(1)).current;
  const rowHeight = useRef(new Animated.Value(0)).current;
  const rowWidthRef = useRef(0);
  const isDeletingRef = useRef(false);
  const [rowWidth, setRowWidth] = useState(0);
  const [layoutReady, setLayoutReady] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const dragStartX = useRef(0);

  const setDeleting = (deleting: boolean) => {
    isDeletingRef.current = deleting;
    setIsDeleting(deleting);
  };

  const snapClosed = () => {
    Animated.spring(translateX, {
      toValue: 0,
      useNativeDriver: true,
      damping: 22,
      stiffness: 280,
      mass: 0.8,
    }).start();
  };

  const runDeleteAnimation = (startX: number) => {
    if (isDeletingRef.current) {
      return;
    }
    setDeleting(true);
    triggerKeyHaptic();

    const slideTarget = -(rowWidthRef.current + ACTION_WIDTH);
    const distance = Math.abs(slideTarget - startX);
    const slideDuration = Math.round(Math.min(320, Math.max(240, distance * 0.9)));

    Animated.parallel([
      Animated.timing(translateX, {
        toValue: slideTarget,
        duration: slideDuration,
        easing: Easing.bezier(0.22, 1, 0.36, 1),
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 0,
        duration: slideDuration * 0.9,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    ]).start(() => {
      Animated.timing(rowHeight, {
        toValue: 0,
        duration: 200,
        easing: Easing.inOut(Easing.cubic),
        useNativeDriver: false,
      }).start(() => onDelete(essential));
    });
  };

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gesture) =>
        !isDeletingRef.current &&
        Math.abs(gesture.dx) > 8 &&
        Math.abs(gesture.dx) > Math.abs(gesture.dy),
      onPanResponderGrant: () => {
        translateX.stopAnimation(value => {
          dragStartX.current = value;
        });
      },
      onPanResponderMove: (_, gesture) => {
        const next = Math.min(
          0,
          Math.max(-ACTION_WIDTH, dragStartX.current + gesture.dx),
        );
        translateX.setValue(next);
      },
      onPanResponderRelease: (_, gesture) => {
        translateX.stopAnimation(value => {
          if (value < -ACTION_WIDTH * 0.45 || gesture.vx < -0.5) {
            runDeleteAnimation(value);
            return;
          }
          snapClosed();
        });
      },
      onPanResponderTerminate: snapClosed,
    }),
  ).current;

  return (
    <Animated.View
      style={[
        styles.rowOuter,
        tileStyle,
        layoutReady ? {height: rowHeight} : null,
      ]}
      collapsable={false}
      onLayout={event => {
        const {width, height} = event.nativeEvent.layout;
        rowWidthRef.current = width;
        setRowWidth(width);
        if (!layoutReady && height > 0) {
          rowHeight.setValue(height);
          setLayoutReady(true);
        }
      }}>
      {rowWidth > 0 ? (
        <Animated.View
          style={[
            styles.slidingRow,
            {
              width: rowWidth + ACTION_WIDTH,
              opacity,
              transform: [{translateX}],
            },
          ]}
          {...(isDeleting ? {} : panResponder.panHandlers)}>
          <Pressable
            disabled={isDeleting}
            onPress={() => {
              translateX.stopAnimation(value => {
                if (Math.abs(value) > 4) {
                  snapClosed();
                  return;
                }
                triggerKeyHaptic();
                onSelect(essential);
              });
            }}
            style={({pressed}) => [
              styles.card,
              {width: rowWidth},
              pressed && !isDeleting && styles.cardPressed,
            ]}>
            <Text style={styles.keyword} numberOfLines={1}>
              @@{essential.keyword}
            </Text>
            <Text style={styles.value} numberOfLines={2}>
              {essential.value || 'Empty value'}
            </Text>
          </Pressable>
          <View style={styles.deleteAction}>
            <DeleteIcon width={24} height={24} color={theme.iconOnEnter} />
          </View>
        </Animated.View>
      ) : null}
    </Animated.View>
  );
}

function createEssentialsSwipeStyles(theme: KeyboardTheme) {
  return StyleSheet.create({
    rowOuter: {
      overflow: 'hidden',
    },
    slidingRow: {
      flexDirection: 'row',
      alignItems: 'stretch',
    },
    card: {
      backgroundColor: theme.pluginCard,
      paddingHorizontal: 12,
      paddingVertical: 10,
      minHeight: 44,
      justifyContent: 'center',
      gap: 2,
    },
    cardPressed: {
      backgroundColor: theme.letterKeyPressed,
    },
    keyword: {
      color: theme.label,
      fontSize: 15,
      fontFamily: theme.fontFamily,
      fontWeight: '600',
    },
    value: {
      color: theme.spaceLabel,
      fontSize: 13,
      fontFamily: theme.fontFamily,
      lineHeight: 18,
    },
    deleteAction: {
      width: ACTION_WIDTH,
      backgroundColor: theme.enter,
      alignItems: 'center',
      justifyContent: 'center',
    },
  });
}
