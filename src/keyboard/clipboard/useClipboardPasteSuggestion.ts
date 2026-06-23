import {useCallback, useEffect, useRef, useState} from 'react';
import {DeviceEventEmitter} from 'react-native';
import {
  fetchClipboardPasteSuggestion,
  type ClipboardPasteSuggestion,
} from './clipboardPasteSuggestion';

type UseClipboardPasteSuggestionOptions = {
  enabled: boolean;
};

let consumedPasteSuggestionFingerprint: string | null = null;

export function useClipboardPasteSuggestion({
  enabled,
}: UseClipboardPasteSuggestionOptions) {
  const [suggestion, setSuggestion] = useState<ClipboardPasteSuggestion | null>(
    null,
  );
  const dismissedRef = useRef(false);
  const lastFingerprintRef = useRef<string | null>(null);

  const refresh = useCallback(async () => {
    if (!enabled) {
      return;
    }
    const next = await fetchClipboardPasteSuggestion();
    if (!next) {
      setSuggestion(null);
      lastFingerprintRef.current = null;
      return;
    }
    if (next.fingerprint === consumedPasteSuggestionFingerprint) {
      setSuggestion(null);
      lastFingerprintRef.current = next.fingerprint;
      return;
    }
    if (consumedPasteSuggestionFingerprint) {
      consumedPasteSuggestionFingerprint = null;
    }
    if (next.fingerprint !== lastFingerprintRef.current) {
      lastFingerprintRef.current = next.fingerprint;
      dismissedRef.current = false;
    }
    if (!dismissedRef.current) {
      setSuggestion(next);
    }
  }, [enabled]);

  const clear = useCallback((fingerprint?: string) => {
    dismissedRef.current = true;
    consumedPasteSuggestionFingerprint = fingerprint ?? lastFingerprintRef.current;
    setSuggestion(null);
  }, []);

  const resetForKeyboardSession = useCallback(() => {
    dismissedRef.current = false;
    lastFingerprintRef.current = null;
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!enabled) {
      return;
    }
    void refresh();
  }, [enabled, refresh]);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const clipboardSub = DeviceEventEmitter.addListener(
      'clipboardChanged',
      () => {
        dismissedRef.current = false;
        void refresh();
      },
    );
    const shownSub = DeviceEventEmitter.addListener('keyboardShown', () => {
      resetForKeyboardSession();
    });
    const hiddenSub = DeviceEventEmitter.addListener('keyboardHidden', () => {
      dismissedRef.current = false;
      lastFingerprintRef.current = null;
      setSuggestion(null);
    });

    return () => {
      clipboardSub.remove();
      shownSub.remove();
      hiddenSub.remove();
    };
  }, [enabled, refresh, resetForKeyboardSession]);

  return {
    clipboardPasteSuggestion: suggestion,
    clearClipboardPasteSuggestion: clear,
    refreshClipboardPasteSuggestion: refresh,
  };
}
