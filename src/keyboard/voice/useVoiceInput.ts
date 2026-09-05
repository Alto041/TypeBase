import {useCallback, useEffect, useRef, useState} from 'react';
import {canUseFeature} from '../../licensing/entitlements';
import {keyboardBridge} from '../keyboardBridge';
import {requireSpeechmaticsApiKey} from '../settings/apiKeysStore';
import {
  ensureVoiceSttProviderLoaded,
  getVoiceSttProvider,
  type VoiceSttProvider,
} from '../settings/voiceSttProviderStore';
import {
  cleanupVoiceTranscript,
  VoiceCleanupError,
} from './geminiVoiceCleanupService';
import {
  playVoiceActivationSound,
  preloadVoiceActivationSound,
} from './voiceActivationSound';
import {SpeechmaticsVoiceService} from './speechmaticsService';
import {getRollingPreviewWords, VOICE_PILL_PREVIEW_MAX_WORDS} from './voiceTranscriptPreview';
import {applyVoiceHeuristicCleanup} from './voiceCleanupUtils';
import {voiceRecorder} from './voiceRecorder';

function resolveSttProvider(): VoiceSttProvider {
  const configured = getVoiceSttProvider();
  if (canUseFeature('voice') || configured === 'android') {
    return configured;
  }
  return 'android';
}

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

function isMissingSpeechmaticsKey(error: unknown): boolean {
  return (
    error instanceof Error &&
    error.message.toLowerCase().includes('speechmatics api key')
  );
}


export function useVoiceInput() {
  const [isListening, setIsListening] = useState(false);
  const [isVoiceSpeaking, setIsVoiceSpeaking] = useState(false);
  const [isVoiceConnecting, setIsVoiceConnecting] = useState(false);
  const [isVoiceProcessing, setIsVoiceProcessing] = useState(false);
  const [partialTranscript, setPartialTranscript] = useState('');
  const [audioLevel, setAudioLevel] = useState(0); // New: audio level 0-1
  const serviceRef = useRef<SpeechmaticsVoiceService | null>(null);
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const activeSttProviderRef = useRef<VoiceSttProvider | null>(null);
  const sessionFinalsRef = useRef<string[]>([]);
  const lastPartialRef = useRef('');
  const stoppingRef = useRef(false);
  const voiceSessionRef = useRef(0);
  const isVoiceProcessingRef = useRef(false);
  const speakingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stopListeningRef = useRef<() => Promise<void>>(async () => {});
  const audioLevelDecayRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const beginVoiceSession = useCallback(() => {
    voiceSessionRef.current += 1;
    return voiceSessionRef.current;
  }, []);

  const cancelVoiceSession = useCallback(() => {
    voiceSessionRef.current += 1;
  }, []);

  const isVoiceSessionActive = useCallback(
    (sessionId: number) => sessionId === voiceSessionRef.current,
    [],
  );

  const markVoiceSpeaking = useCallback(() => {
    if (speakingTimerRef.current) {
      clearTimeout(speakingTimerRef.current);
    }
    setIsVoiceSpeaking(true);
    speakingTimerRef.current = setTimeout(() => {
      speakingTimerRef.current = null;
      setIsVoiceSpeaking(false);
    }, 700);
  }, []);

  // Update audio level based on partial transcript or speaking state
  const updateAudioLevel = useCallback((level: number) => {
    setAudioLevel(Math.max(0, Math.min(1, level)));
  }, []);

  const resetSession = useCallback(() => {
    if (speakingTimerRef.current) {
      clearTimeout(speakingTimerRef.current);
      speakingTimerRef.current = null;
    }
    if (audioLevelDecayRef.current) {
      clearInterval(audioLevelDecayRef.current);
      audioLevelDecayRef.current = null;
    }
    sessionFinalsRef.current = [];
    lastPartialRef.current = '';
    isVoiceProcessingRef.current = false;
    setPartialTranscript('');
    setIsVoiceSpeaking(false);
    setIsVoiceProcessing(false);
    setIsVoiceConnecting(false);
    setAudioLevel(0);
  }, []);

  const refreshPreview = useCallback(() => {
    setPartialTranscript(
      getRollingPreviewWords(
        sessionFinalsRef.current,
        lastPartialRef.current,
        VOICE_PILL_PREVIEW_MAX_WORDS,
      ).join(' '),
    );
  }, []);

  const updateLivePreview = useCallback(
    (partial: string) => {
      if (isVoiceProcessingRef.current) {
        return;
      }

      if (partial.trim() && partial.trim() !== lastPartialRef.current.trim()) {
        markVoiceSpeaking();
        // Boost audio level when new partial is detected
        updateAudioLevel(0.7 + Math.random() * 0.3); // 0.7-1.0
      }
      lastPartialRef.current = partial;
      refreshPreview();
    },
    [markVoiceSpeaking, refreshPreview, updateAudioLevel],
  );

  const appendFinalSegment = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) {
        return;
      }

      lastPartialRef.current = '';
      sessionFinalsRef.current.push(trimmed);
      markVoiceSpeaking();
      refreshPreview();
    },
    [markVoiceSpeaking, refreshPreview],
  );

  const finishSession = useCallback(async (sttProvider: VoiceSttProvider | null) => {
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
    isVoiceProcessingRef.current = true;
    setPartialTranscript('');

    let textToInsert = raw;

    if (canUseFeature('voice')) {
      try {
        const {text} = await cleanupVoiceTranscript(raw, {
          preferOnDevice: sttProvider === 'parakeet',
          allowFillerRemoval: true,
        });
        textToInsert = text.trim() || raw;
      } catch (error) {
        if (!(error instanceof VoiceCleanupError)) {
          throw error;
        }
        textToInsert = raw;
      }
    } else {
      textToInsert = applyVoiceHeuristicCleanup(raw) || raw;
    }

    const toInsert = formatDictationInsert(textToInsert);
    if (toInsert) {
      keyboardBridge.insertText(toInsert);
    }

    setPartialTranscript('');
    setIsVoiceProcessing(false);
    isVoiceProcessingRef.current = false;
  }, []);

  const teardownVoiceResources = useCallback(async () => {
    if (speakingTimerRef.current) {
      clearTimeout(speakingTimerRef.current);
      speakingTimerRef.current = null;
    }

    const activeProvider = activeSttProviderRef.current;

    if (activeProvider === 'parakeet') {
      await voiceRecorder.stopParakeetStt().catch(() => {});
    } else if (activeProvider === 'android') {
      await voiceRecorder.stopAndroidStt().catch(() => {});
    } else {
      await voiceRecorder.stop().catch(() => {});
    }

    unsubscribeRef.current?.();
    unsubscribeRef.current = null;

    const service = serviceRef.current;
    serviceRef.current = null;
    if (service) {
      await service.stop().catch(() => {});
    }

    activeSttProviderRef.current = null;
  }, []);

  const abortInFlightVoice = useCallback(async () => {
    if (stoppingRef.current) {
      return;
    }
    stoppingRef.current = true;
    cancelVoiceSession();

    try {
      setIsListening(false);
      setIsVoiceSpeaking(false);
      setIsVoiceConnecting(false);
      await teardownVoiceResources();
      resetSession();
    } finally {
      stoppingRef.current = false;
    }
  }, [cancelVoiceSession, resetSession, teardownVoiceResources]);

  const stopListening = useCallback(async () => {
    if (stoppingRef.current) {
      return;
    }
    stoppingRef.current = true;
    cancelVoiceSession();

    try {
      setIsListening(false);
      setIsVoiceSpeaking(false);
      setIsVoiceConnecting(false);

      const activeProvider = activeSttProviderRef.current;
      await teardownVoiceResources();
      await finishSession(activeProvider);
    } finally {
      stoppingRef.current = false;
    }
  }, [cancelVoiceSession, finishSession, teardownVoiceResources]);

  stopListeningRef.current = stopListening;

  const startParakeetListening = useCallback(
    async (sessionId: number): Promise<boolean> => {
      activeSttProviderRef.current = 'parakeet';
      const isAvailable = await voiceRecorder.isParakeetSttAvailable();
      if (!isVoiceSessionActive(sessionId)) {
        activeSttProviderRef.current = null;
        return false;
      }
      if (!isAvailable) {
        activeSttProviderRef.current = null;
        return false;
      }

      unsubscribeRef.current = voiceRecorder.subscribeParakeetStt({
        onPartial: partial => {
          if (!isVoiceSessionActive(sessionId)) {
            return;
          }
          updateLivePreview(partial);
        },
        onFinal: text => {
          if (!isVoiceSessionActive(sessionId)) {
            return;
          }
          appendFinalSegment(text);
        },
        onError: () => {
          if (!stoppingRef.current && isVoiceSessionActive(sessionId)) {
            void stopListeningRef.current();
          }
        },
      });

      try {
        await voiceRecorder.startParakeetStt();
        if (!isVoiceSessionActive(sessionId)) {
          await voiceRecorder.stopParakeetStt().catch(() => {});
          unsubscribeRef.current?.();
          unsubscribeRef.current = null;
          activeSttProviderRef.current = null;
          return false;
        }
        setIsVoiceConnecting(false);
        setIsListening(true);
        playVoiceActivationSound();
        return true;
      } catch {
        unsubscribeRef.current?.();
        unsubscribeRef.current = null;
        activeSttProviderRef.current = null;
        setIsListening(false);
        return false;
      }
    },
    [appendFinalSegment, isVoiceSessionActive, updateLivePreview],
  );

  const startAndroidListening = useCallback(
    async (sessionId: number): Promise<boolean> => {
      activeSttProviderRef.current = 'android';
      const isAvailable = await voiceRecorder.isAndroidSttAvailable();
      if (!isVoiceSessionActive(sessionId)) {
        activeSttProviderRef.current = null;
        return false;
      }
      if (!isAvailable) {
        activeSttProviderRef.current = null;
        return false;
      }

      unsubscribeRef.current = voiceRecorder.subscribeAndroidStt({
        onReady: () => {
          if (!isVoiceSessionActive(sessionId)) {
            return;
          }
          setIsVoiceConnecting(false);
          setIsListening(true);
          playVoiceActivationSound();
        },
        onPartial: partial => {
          if (!isVoiceSessionActive(sessionId)) {
            return;
          }
          updateLivePreview(partial);
        },
        onFinal: text => {
          if (!isVoiceSessionActive(sessionId)) {
            return;
          }
          appendFinalSegment(text);
        },
        onError: () => {
          if (!stoppingRef.current && isVoiceSessionActive(sessionId)) {
            void stopListeningRef.current();
          }
        },
      });

      try {
        await voiceRecorder.startAndroidStt();
        if (!isVoiceSessionActive(sessionId)) {
          await voiceRecorder.stopAndroidStt().catch(() => {});
          unsubscribeRef.current?.();
          unsubscribeRef.current = null;
          activeSttProviderRef.current = null;
          return false;
        }
        return true;
      } catch {
        unsubscribeRef.current?.();
        unsubscribeRef.current = null;
        activeSttProviderRef.current = null;
        setIsListening(false);
        return false;
      }
    },
    [appendFinalSegment, isVoiceSessionActive, updateLivePreview],
  );

  const startListening = useCallback(async () => {
    if (isVoiceProcessing || stoppingRef.current) {
      return;
    }

    const sessionId = beginVoiceSession();

    const hasPermission = await voiceRecorder.hasMicPermission();
    if (!isVoiceSessionActive(sessionId)) {
      return;
    }
    if (!hasPermission) {
      await voiceRecorder.openAppForMicPermission();
      return;
    }

    resetSession();
    setIsVoiceConnecting(true);

    await ensureVoiceSttProviderLoaded();
    if (!isVoiceSessionActive(sessionId)) {
      return;
    }
    const sttProvider = resolveSttProvider();

    if (sttProvider === 'parakeet') {
      const started = await startParakeetListening(sessionId);
      if (!isVoiceSessionActive(sessionId)) {
        return;
      }
      if (!started) {
        const androidStarted = await startAndroidListening(sessionId);
        if (!isVoiceSessionActive(sessionId)) {
          return;
        }
        if (!androidStarted) {
          setIsVoiceConnecting(false);
          activeSttProviderRef.current = null;
          resetSession();
        }
      }
      return;
    }

    activeSttProviderRef.current = sttProvider;

    if (sttProvider === 'android') {
      const started = await startAndroidListening(sessionId);
      if (!isVoiceSessionActive(sessionId)) {
        return;
      }
      if (!started) {
        setIsVoiceConnecting(false);
        resetSession();
      }
      return;
    }

    const service = new SpeechmaticsVoiceService();
    serviceRef.current = service;

    service.setHandlers({
      onPartial: partial => {
        if (!isVoiceSessionActive(sessionId)) {
          return;
        }
        updateLivePreview(partial);
      },
      onFinal: text => {
        if (!isVoiceSessionActive(sessionId)) {
          return;
        }
        appendFinalSegment(text);
      },
      onError: () => {
        if (!stoppingRef.current && isVoiceSessionActive(sessionId)) {
          void stopListeningRef.current();
        }
      },
    });

    try {
      let apiKey: string;
      try {
        apiKey = await requireSpeechmaticsApiKey();
      } catch (error) {
        if (!isVoiceSessionActive(sessionId)) {
          return;
        }
        if (isMissingSpeechmaticsKey(error)) {
          await service.stop().catch(() => {});
          serviceRef.current = null;
          const started = await startAndroidListening(sessionId);
          if (!isVoiceSessionActive(sessionId)) {
            return;
          }
          if (!started) {
            setIsVoiceConnecting(false);
            resetSession();
          }
          return;
        }
        throw error;
      }

      if (!isVoiceSessionActive(sessionId)) {
        await service.stop().catch(() => {});
        serviceRef.current = null;
        return;
      }

      await service.start(apiKey);
      if (!isVoiceSessionActive(sessionId)) {
        await service.stop().catch(() => {});
        serviceRef.current = null;
        return;
      }

      setIsVoiceConnecting(false);
      playVoiceActivationSound();
      unsubscribeRef.current = voiceRecorder.subscribe(base64 => {
        if (!isVoiceSessionActive(sessionId)) {
          return;
        }
        service.sendAudioBase64(base64);
      });
      await voiceRecorder.start();
      if (!isVoiceSessionActive(sessionId)) {
        unsubscribeRef.current?.();
        unsubscribeRef.current = null;
        await voiceRecorder.stop().catch(() => {});
        await service.stop().catch(() => {});
        serviceRef.current = null;
        activeSttProviderRef.current = null;
        return;
      }
      setIsListening(true);
    } catch {
      if (!isVoiceSessionActive(sessionId)) {
        return;
      }
      const startedFallback = await startAndroidListening(sessionId);
      if (!isVoiceSessionActive(sessionId)) {
        return;
      }
      if (startedFallback) {
        return;
      }
      setIsVoiceConnecting(false);
      serviceRef.current = null;
      activeSttProviderRef.current = null;
      await service.stop().catch(() => {});
      resetSession();
    }
  }, [
    appendFinalSegment,
    beginVoiceSession,
    isVoiceProcessing,
    isVoiceSessionActive,
    resetSession,
    startAndroidListening,
    startParakeetListening,
    updateLivePreview,
  ]);

  const toggleListening = useCallback(async () => {
    if (isVoiceProcessing || stoppingRef.current) {
      return;
    }

    if (isVoiceConnecting) {
      await abortInFlightVoice();
      return;
    }

    if (isListening) {
      await stopListening();
    } else {
      await startListening();
    }
  }, [
    abortInFlightVoice,
    isListening,
    isVoiceConnecting,
    isVoiceProcessing,
    startListening,
    stopListening,
  ]);

  useEffect(() => {
    preloadVoiceActivationSound();
    return () => {
      void stopListeningRef.current();
    };
  }, []);

  useEffect(() => {
    if (!isListening) {
      if (audioLevelDecayRef.current) {
        clearInterval(audioLevelDecayRef.current);
        audioLevelDecayRef.current = null;
      }
      setAudioLevel(0);
      return;
    }

    audioLevelDecayRef.current = setInterval(() => {
      setAudioLevel(prev => Math.max(0, prev - 0.04));
    }, 80);

    return () => {
      if (audioLevelDecayRef.current) {
        clearInterval(audioLevelDecayRef.current);
        audioLevelDecayRef.current = null;
      }
    };
  }, [isListening]);

  return {
    isListening,
    isVoiceSpeaking,
    isVoiceConnecting,
    isVoiceProcessing,
    partialTranscript,
    audioLevel,
    toggleListening,
  };
}
