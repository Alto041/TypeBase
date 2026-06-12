import {useCallback, useEffect, useRef, useState} from 'react';
import {keyboardBridge} from '../keyboardBridge';
import {requireSpeechmaticsApiKey} from '../settings/apiKeysStore';
import {
  cleanupVoiceTranscript,
  VoiceCleanupError,
} from './geminiVoiceCleanupService';
import {
  playVoiceActivationSound,
  preloadVoiceActivationSound,
} from './voiceActivationSound';
import {SpeechmaticsVoiceService} from './speechmaticsService';
import {getRollingPreviewWords} from './voiceTranscriptPreview';
import {voiceRecorder} from './voiceRecorder';

function formatDictationInsert(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) {
    return '';
  }
  return trimmed.endsWith(' ') ? trimmed : `${trimmed} `;
}

function joinSessionTranscript(segments: string[]): string {
  return segments.join(' ').trim();
}

function buildSessionRaw(finals: string[], pendingPartial: string): string {
  const committed = joinSessionTranscript(finals);
  const partial = pendingPartial.trim();

  if (!committed) {
    return partial;
  }
  if (!partial) {
    return committed;
  }
  if (partial.startsWith(committed)) {
    return partial;
  }
  return `${committed} ${partial}`;
}

export function useVoiceInput() {
  const [isListening, setIsListening] = useState(false);
  const [isVoiceConnecting, setIsVoiceConnecting] = useState(false);
  const [isVoiceProcessing, setIsVoiceProcessing] = useState(false);
  const [partialTranscript, setPartialTranscript] = useState('');
  const serviceRef = useRef<SpeechmaticsVoiceService | null>(null);
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const sessionFinalsRef = useRef<string[]>([]);
  const lastPartialRef = useRef('');
  const stoppingRef = useRef(false);
  const stopListeningRef = useRef<() => Promise<void>>(async () => {});

  const resetSession = useCallback(() => {
    sessionFinalsRef.current = [];
    lastPartialRef.current = '';
    setPartialTranscript('');
    setIsVoiceProcessing(false);
    setIsVoiceConnecting(false);
  }, []);

  const refreshPreview = useCallback(() => {
    setPartialTranscript(
      getRollingPreviewWords(
        sessionFinalsRef.current,
        lastPartialRef.current,
      ).join(' '),
    );
  }, []);

  const updateLivePreview = useCallback(
    (partial: string) => {
      if (isVoiceProcessing) {
        return;
      }

      lastPartialRef.current = partial;
      refreshPreview();
    },
    [isVoiceProcessing, refreshPreview],
  );

  const appendFinalSegment = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) {
        return;
      }

      lastPartialRef.current = '';
      sessionFinalsRef.current.push(trimmed);
      refreshPreview();
    },
    [refreshPreview],
  );

  const finishSession = useCallback(async () => {
    const raw = buildSessionRaw(
      sessionFinalsRef.current,
      lastPartialRef.current,
    );
    sessionFinalsRef.current = [];
    lastPartialRef.current = '';

    if (!raw) {
      setPartialTranscript('');
      setIsVoiceProcessing(false);
      return;
    }

    setIsVoiceProcessing(true);
    setPartialTranscript('');

    let textToInsert = raw;

    try {
      const {text} = await cleanupVoiceTranscript(raw);
      textToInsert = text.trim() || raw;
    } catch (error) {
      if (!(error instanceof VoiceCleanupError)) {
        throw error;
      }
      // Gemini failed — still insert the Speechmatics transcript.
      textToInsert = raw;
    }

    const toInsert = formatDictationInsert(textToInsert);
    if (toInsert) {
      keyboardBridge.insertText(toInsert);
    }

    setPartialTranscript('');
    setIsVoiceProcessing(false);
  }, []);

  const stopListening = useCallback(async () => {
    if (stoppingRef.current) {
      return;
    }
    stoppingRef.current = true;

    try {
      setIsListening(false);
      setIsVoiceConnecting(false);

      unsubscribeRef.current?.();
      unsubscribeRef.current = null;

      await voiceRecorder.stop().catch(() => {});

      const service = serviceRef.current;
      serviceRef.current = null;
      if (service) {
        await service.stop().catch(() => {});
      }

      await finishSession();
    } finally {
      stoppingRef.current = false;
    }
  }, [finishSession]);

  stopListeningRef.current = stopListening;

  const startListening = useCallback(async () => {
    if (isVoiceProcessing || stoppingRef.current) {
      return;
    }

    const hasPermission = await voiceRecorder.hasMicPermission();
    if (!hasPermission) {
      await voiceRecorder.openAppForMicPermission();
      return;
    }

    resetSession();
    setIsVoiceConnecting(true);

    const service = new SpeechmaticsVoiceService();
    serviceRef.current = service;

    service.setHandlers({
      onPartial: partial => {
        updateLivePreview(partial);
      },
      onFinal: text => {
        appendFinalSegment(text);
      },
      onError: () => {
        if (!stoppingRef.current) {
          void stopListeningRef.current();
        }
      },
    });

    try {
      const apiKey = await requireSpeechmaticsApiKey();
      await service.start(apiKey);
      setIsVoiceConnecting(false);
      playVoiceActivationSound();
      unsubscribeRef.current = voiceRecorder.subscribe(base64 => {
        service.sendAudioBase64(base64);
      });
      await voiceRecorder.start();
      setIsListening(true);
    } catch {
      setIsVoiceConnecting(false);
      serviceRef.current = null;
      await service.stop().catch(() => {});
      resetSession();
    }
  }, [appendFinalSegment, isVoiceProcessing, resetSession, updateLivePreview]);

  const toggleListening = useCallback(async () => {
    if (isVoiceProcessing || stoppingRef.current) {
      return;
    }

    if (isVoiceConnecting) {
      setIsVoiceConnecting(false);
      const service = serviceRef.current;
      serviceRef.current = null;
      await service?.stop().catch(() => {});
      resetSession();
      return;
    }

    if (isListening) {
      await stopListening();
    } else {
      await startListening();
    }
  }, [
    isListening,
    isVoiceConnecting,
    isVoiceProcessing,
    resetSession,
    startListening,
    stopListening,
  ]);

  useEffect(() => {
    preloadVoiceActivationSound();
    return () => {
      void stopListeningRef.current();
    };
  }, []);

  return {
    isListening,
    isVoiceConnecting,
    isVoiceProcessing,
    partialTranscript,
    toggleListening,
  };
}
