import React, {useMemo, useRef, useState} from 'react';
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
import KeepIcon from '../../../assets/keep.svg';
import KeepOffIcon from '../../../assets/keep_off.svg';
import {triggerKeyHaptic} from '../haptics';
import {keyboardTheme} from '../theme';
import type {ClipboardItem} from './types';

const CARD_COLOR = '#353535';
const PIN_ICON_COLOR = '#828282';
const PIN_ICON_SIZE = 16;
const ACTION_WIDTH = 72;

type ClipboardSwipeRowProps = {
  item: ClipboardItem;
  tileStyle?: StyleProp<ViewStyle>;
  onSelect: (item: ClipboardItem) => void;
  onDelete: (item: ClipboardItem) => void;
  onTogglePin: (item: ClipboardItem) => void;
};

export function ClipboardSwipeRow({
  item,
  tileStyle,
  onSelect,
  onDelete,
  onTogglePin,
}: ClipboardSwipeRowProps) {
  const translateX = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(1)).current;
  const rowHeight = useRef(new Animated.Value(0)).current;
  const rowWidthRef = useRef(0);
  const isDeletingRef = useRef(false);
  const [rowWidth, setRowWidth] = useState(0);
  const [layoutReady, setLayoutReady] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const dragStartX = useRef(0);

  const pinOpacity = useMemo(
    () =>
      translateX.interpolate({
        inputRange: [-ACTION_WIDTH, -12, 0],
        outputRange: [0, 0, 1],
        extrapolate: 'clamp',
      }),
    [translateX],
  );

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
      }).start(() => onDelete(item));
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
          <View style={[styles.card, {width: rowWidth}]}>
            <Pressable
              disabled={isDeleting}
              onPress={() => {
                translateX.stopAnimation(value => {
                  if (Math.abs(value) > 4) {
                    snapClosed();
                    return;
                  }
                  triggerKeyHaptic();
                  onSelect(item);
                });
              }}
              style={({pressed}) => [
                styles.cardBody,
                pressed && !isDeleting && styles.cardPressed,
              ]}>
              <Text style={styles.cardText} numberOfLines={3}>
                {item.text}
              </Text>
            </Pressable>
            <Animated.View style={[styles.pinSlot, {opacity: pinOpacity}]}>
              <Pressable
                disabled={isDeleting}
                hitSlop={8}
                onPress={() => {
                  triggerKeyHaptic();
                  onTogglePin(item);
                }}
                style={({pressed}) => [
                  styles.pinButton,
                  pressed && styles.pinButtonPressed,
                ]}>
                {item.pinned ? (
                  <KeepOffIcon
                    width={PIN_ICON_SIZE}
                    height={PIN_ICON_SIZE}
                    color={PIN_ICON_COLOR}
                  />
                ) : (
                  <KeepIcon
                    width={PIN_ICON_SIZE}
                    height={PIN_ICON_SIZE}
                    color={PIN_ICON_COLOR}
                  />
                )}
              </Pressable>
            </Animated.View>
          </View>
          <View style={styles.deleteAction}>
            <DeleteIcon width={24} height={24} />
          </View>
        </Animated.View>
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  rowOuter: {
    overflow: 'hidden',
  },
  slidingRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: CARD_COLOR,
    minHeight: 44,
  },
  cardBody: {
    flex: 1,
    paddingLeft: 12,
    paddingVertical: 10,
    minHeight: 44,
    justifyContent: 'center',
  },
  cardPressed: {
    backgroundColor: keyboardTheme.keyPressed,
  },
  cardText: {
    color: keyboardTheme.label,
    fontSize: 15,
    fontFamily: keyboardTheme.fontFamily,
    lineHeight: 20,
  },
  pinSlot: {
    paddingRight: 10,
    paddingLeft: 4,
    justifyContent: 'center',
  },
  pinButton: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
  },
  pinButtonPressed: {
    backgroundColor: keyboardTheme.keyPressed,
  },
  deleteAction: {
    width: ACTION_WIDTH,
    backgroundColor: keyboardTheme.enter,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
