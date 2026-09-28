import React, {useCallback, useEffect, useRef, useState} from 'react';
import {
  Platform,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

const KERNING = -0.7;

/** Idle copy — Quivox engineering + TypeBase product (Launchpad tone). */
const IDLE_FACTS = [
  'QUIVOX ENGINEERING · LETTERS COMMIT ON TOUCH-DOWN',
  'TYPEBASE · SYM SPELL + CONTEXT AT SPACE',
  'QUIVOX · MULTI-TOUCH WITHOUT GHOST KEYS',
  'TYPEBASE · ON-DEVICE GEMMA WHEN CLOUD IS OFF',
  'QUIVOX ENGINEERING · NATIVE PREFIX BAR OFF THE JS THREAD',
  'TYPEBASE · PLUGINS, VOICE, SNIPPETS IN ONE IME',
] as const;

const TYPE_MS = 32;
const HOLD_MS = 2_400;
const DELETE_MS = 14;
const PAUSE_MS = 480;

type LaunchpadTestInputProps = {
  placeholder?: string;
};

export function LaunchpadTestInput({
  placeholder = 'TEST KEYBOARD HERE',
}: LaunchpadTestInputProps) {
  const [focused, setFocused] = useState(false);
  const [hasText, setHasText] = useState(false);
  const [typedLine, setTypedLine] = useState('');
  const [showCursor, setShowCursor] = useState(true);

  const runIdRef = useRef(0);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const clearTimers = useCallback(() => {
    timersRef.current.forEach(t => clearTimeout(t));
    timersRef.current = [];
  }, []);

  const delay = useCallback((ms: number) => {
    return new Promise<void>(resolve => {
      const t = setTimeout(resolve, ms);
      timersRef.current.push(t);
    });
  }, []);

  const showIdleTypewriter = !focused && !hasText;

  useEffect(() => {
    if (!showIdleTypewriter) {
      runIdRef.current += 1;
      clearTimers();
      setTypedLine('');
      return;
    }

    const runId = ++runIdRef.current;
    let factIndex = 0;

    const run = async () => {
      while (runId === runIdRef.current && !focused && !hasText) {
        const fact = IDLE_FACTS[factIndex % IDLE_FACTS.length];
        factIndex += 1;

        for (let i = 1; i <= fact.length; i += 1) {
          if (runId !== runIdRef.current) {
            return;
          }
          setTypedLine(fact.slice(0, i));
          await delay(TYPE_MS);
        }

        await delay(HOLD_MS);
        if (runId !== runIdRef.current) {
          return;
        }

        for (let i = fact.length - 1; i >= 0; i -= 1) {
          if (runId !== runIdRef.current) {
            return;
          }
          setTypedLine(fact.slice(0, i));
          await delay(DELETE_MS);
        }

        await delay(PAUSE_MS);
      }
    };

    void run();

    return () => {
      runIdRef.current += 1;
      clearTimers();
    };
  }, [showIdleTypewriter, clearTimers, delay, focused, hasText]);

  useEffect(() => {
    if (!showIdleTypewriter) {
      return;
    }
    const blink = setInterval(() => {
      setShowCursor(current => !current);
    }, 530);
    return () => clearInterval(blink);
  }, [showIdleTypewriter]);

  return (
    <View style={styles.box}>
      {showIdleTypewriter ? (
        <View pointerEvents="none" style={styles.idleLayer}>
          <Text style={styles.idleText} numberOfLines={2}>
            {typedLine}
            {showCursor ? '|' : ' '}
          </Text>
        </View>
      ) : null}

      <TextInput
        style={styles.field}
        placeholder={showIdleTypewriter ? '' : placeholder}
        placeholderTextColor="#000000"
        multiline
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onChangeText={text => setHasText(text.length > 0)}
        selectionColor="#111111"
        textAlignVertical={Platform.OS === 'android' ? 'center' : undefined}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    backgroundColor: '#DDDCDC',
    borderRadius: 24,
    padding: 12,
    minHeight: 64,
    justifyContent: 'center',
  },
  idleLayer: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    paddingHorizontal: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  idleText: {
    fontFamily: 'FragmentMono',
    fontSize: 13,
    lineHeight: 18,
    color: '#111111',
    textAlign: 'center',
    letterSpacing: KERNING,
  },
  field: {
    fontFamily: 'FragmentMono',
    fontSize: 15,
    color: '#111111',
    textAlign: 'center',
    minHeight: 40,
    letterSpacing: KERNING,
    paddingVertical: 0,
  },
});
