import {useCallback, useEffect, useRef, useState} from 'react';
import {DeviceEventEmitter} from 'react-native';
import {
  fetchClipboardPasteSuggestion,
  type ClipboardPasteSuggestion,
} from './clipboardPasteSuggestion';
import {addClipboardImage} from './clipboardStore';

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

    // When native proactively snapshots a clipboard image (in the clip listener,
    // while grants are fresh), it emits the saved local path/hash. We add it
    // directly to the store (using our owned file) so that the suggestion bar
    // can surface the image immediately without waiting for (or depending on)
    // a later captureSystemClipboard that might no longer have URI access.
    const capturedSub = DeviceEventEmitter.addListener(
      'clipboardImageCaptured',
      (raw: unknown) => {
        if (typeof raw !== 'string' || !raw) return;
        try {
          const data = JSON.parse(raw) as {
            kind?: string;
            imagePath?: string;
            imageHash?: string;
            mimeType?: string;
          };
          if (data?.kind === 'image' && data.imagePath && data.imageHash) {
            dismissedRef.current = false;
            void addClipboardImage(
              data.imagePath,
              data.imageHash,
              data.mimeType,
              {bumpExisting: true},
            ).then(() => {
              void refresh();
            });
          }
        } catch {
          // ignore malformed payloads
        }
      },
    );

    return () => {
      clipboardSub.remove();
      shownSub.remove();
      hiddenSub.remove();
      capturedSub.remove();
    };
  }, [enabled, refresh, resetForKeyboardSession]);

  return {
    clipboardPasteSuggestion: suggestion,
    clearClipboardPasteSuggestion: clear,
    refreshClipboardPasteSuggestion: refresh,
  };
}
