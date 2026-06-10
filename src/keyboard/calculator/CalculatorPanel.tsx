import React, {useCallback, useMemo, useState} from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {
  PLUGIN_CARD_COLOR,
  pluginPanelStyles,
} from '../components/pluginPanelLayout';
import {triggerKeyHaptic} from '../haptics';
import {keyboardTheme} from '../theme';
import {
  applyPercent,
  evaluateExpression,
  formatNumber,
} from './calculatorEngine';

type CalculatorPanelProps = {
  onInsert: (value: string) => void;
  onDisplayChange?: (value: string) => void;
};

type CalcKey = {
  label: string;
  value: string;
  flex?: number;
  accent?: boolean;
  action?: boolean;
};

const KEY_ROWS: CalcKey[][] = [
  [
    {label: 'C', value: 'clear', action: true},
    {label: '%', value: '%', action: true},
    {label: '⌫', value: 'backspace', action: true},
    {label: '÷', value: '÷', action: true},
  ],
  [
    {label: '7', value: '7'},
    {label: '8', value: '8'},
    {label: '9', value: '9'},
    {label: '×', value: '×', action: true},
  ],
  [
    {label: '4', value: '4'},
    {label: '5', value: '5'},
    {label: '6', value: '6'},
    {label: '-', value: '-', action: true},
  ],
  [
    {label: '1', value: '1'},
    {label: '2', value: '2'},
    {label: '3', value: '3'},
    {label: '+', value: '+', action: true},
  ],
  [
    {label: '0', value: '0', flex: 2},
    {label: '.', value: '.'},
    {label: '=', value: '=', accent: true},
  ],
];

export function CalculatorPanel({onInsert, onDisplayChange}: CalculatorPanelProps) {
  const [expression, setExpression] = useState('');
  const [display, setDisplay] = useState('0');

  const publishDisplay = useCallback(
    (nextDisplay: string) => {
      setDisplay(nextDisplay);
      onDisplayChange?.(nextDisplay);
    },
    [onDisplayChange],
  );

  const updateDisplay = useCallback(
    (nextExpression: string) => {
      setExpression(nextExpression);
      if (!nextExpression) {
        publishDisplay('0');
        return;
      }
      const evaluated = evaluateExpression(nextExpression);
      publishDisplay(
        evaluated === null ? nextExpression : formatNumber(evaluated),
      );
    },
    [publishDisplay],
  );

  const handleKey = useCallback(
    (key: CalcKey) => {
      triggerKeyHaptic();

      if (key.value === 'clear') {
        setExpression('');
        publishDisplay('0');
        return;
      }

      if (key.value === 'backspace') {
        const next = expression.slice(0, -1);
        updateDisplay(next);
        return;
      }

      if (key.value === '%') {
        const next = applyPercent(expression);
        updateDisplay(next);
        return;
      }

      if (key.value === '=') {
        const result = evaluateExpression(expression);
        if (result === null) {
          publishDisplay('Error');
          return;
        }
        const formatted = formatNumber(result);
        setExpression(formatted);
        publishDisplay(formatted);
        return;
      }

      if (key.value === '.') {
        const lastNumber = expression.match(/(\d+\.?\d*)$/);
        if (lastNumber && lastNumber[0].includes('.')) {
          return;
        }
        if (!expression || /[+\-×÷]$/.test(expression)) {
          updateDisplay(`${expression}0.`);
          return;
        }
      }

      if (/[+\-×÷]/.test(key.value)) {
        if (!expression) {
          return;
        }
        if (/[+\-×÷]$/.test(expression)) {
          updateDisplay(expression.slice(0, -1) + key.value);
          return;
        }
      }

      updateDisplay(expression + key.value);
    },
    [expression, publishDisplay, updateDisplay],
  );

  const handleDisplayPress = useCallback(() => {
    if (!display || display === '0' || display === 'Error') {
      return;
    }
    triggerKeyHaptic();
    onInsert(display);
  }, [display, onInsert]);

  const displayText = useMemo(() => {
    if (display.length > 14) {
      return display.slice(0, 14);
    }
    return display;
  }, [display]);

  return (
    <View style={pluginPanelStyles.container}>
      <Pressable
        onPress={handleDisplayPress}
        style={({pressed}) => [
          styles.display,
          pressed && styles.displayPressed,
        ]}>
        <Text style={styles.displayText} numberOfLines={1} adjustsFontSizeToFit>
          {displayText}
        </Text>
      </Pressable>

      <View style={styles.keypad}>
        {KEY_ROWS.map((row, rowIndex) => (
          <View key={`row-${rowIndex}`} style={styles.row}>
            {row.map(key => (
              <Pressable
                key={key.label}
                onPressIn={() => handleKey(key)}
                style={({pressed}) => [
                  styles.key,
                  key.flex ? {flex: key.flex} : styles.keyDefault,
                  key.accent && styles.keyAccent,
                  key.action && styles.keyAction,
                  pressed && styles.keyPressed,
                ]}>
                <Text
                  style={[
                    styles.keyLabel,
                    key.accent && styles.keyLabelAccent,
                  ]}>
                  {key.label}
                </Text>
              </Pressable>
            ))}
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  display: {
    marginHorizontal: 12,
    marginTop: 4,
    marginBottom: 4,
    minHeight: 36,
    borderRadius: 8,
    backgroundColor: PLUGIN_CARD_COLOR,
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  displayPressed: {
    backgroundColor: keyboardTheme.keyPressed,
  },
  displayText: {
    color: keyboardTheme.label,
    fontSize: 24,
    fontFamily: keyboardTheme.fontFamily,
    fontWeight: '600',
    textAlign: 'right',
  },
  keypad: {
    flex: 1,
    paddingHorizontal: 12,
    paddingBottom: 4,
    gap: 4,
  },
  row: {
    flex: 1,
    flexDirection: 'row',
    gap: 4,
  },
  key: {
    minHeight: 28,
    borderRadius: 6,
    backgroundColor: PLUGIN_CARD_COLOR,
    alignItems: 'center',
    justifyContent: 'center',
  },
  keyDefault: {
    flex: 1,
  },
  keyAction: {
    backgroundColor: '#474747',
  },
  keyAccent: {
    backgroundColor: keyboardTheme.enter,
  },
  keyPressed: {
    backgroundColor: keyboardTheme.keyPressed,
  },
  keyLabel: {
    color: keyboardTheme.label,
    fontSize: 18,
    fontFamily: keyboardTheme.fontFamily,
    fontWeight: '600',
  },
  keyLabelAccent: {
    color: keyboardTheme.label,
  },
});
