import {useCallback, useEffect, useRef, useState} from 'react';
import {keyboardBridge} from '../keyboardBridge';
import {SPEECHMATICS_API_KEY} from './speechmaticsConfig';
import {SpeechmaticsVoiceService} from './speechmaticsService';
import {
  rollingPreviewText,
  splitPartialWords,
} from './voiceTranscriptPreview';
import {voiceRecorder} from './voiceRecorder';

export function useVoiceInput() {
  const [isListening, setIsListening] = useState(false);
  const [partialTranscript, setPartialTranscript] = useState('');
  const serviceRef = useRef<SpeechmaticsVoiceService | null>(null);
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const committedWordsRef = useRef<string[]>([]);
  const segmentInsertedCountRef = useRef(0);

  const resetSession = useCallback(() => {
    committedWordsRef.current = [];
    segmentInsertedCountRef.current = 0;
    setPartialTranscript('');
  }, []);

  const insertWord = useCallback((word: string) => {
    keyboardBridge.insertText(`${word} `);
  }, []);

  const insertCompletePartialWords = useCallback(
    (completeWords: string[]) => {
      while (segmentInsertedCountRef.current < completeWords.length) {
        const word = completeWords[segmentInsertedCountRef.current];
        insertWord(word);
        committedWordsRef.current.push(word);
        segmentInsertedCountRef.current += 1;
      }
    },
    [insertWord],
  );

  const updatePreview = useCallback((partial: string) => {
    setPartialTranscript(rollingPreviewText(committedWordsRef.current, partial));
  }, []);

  const stopListening = useCallback(async () => {
    unsubscribeRef.current?.();
    unsubscribeRef.current = null;
    await voiceRecorder.stop().catch(() => {});
    await serviceRef.current?.stop().catch(() => {});
    serviceRef.current = null;
    setIsListening(false);
    resetSession();
  }, [resetSession]);

  const startListening = useCallback(async () => {
    const hasPermission = await voiceRecorder.hasMicPermission();
    if (!hasPermission) {
      await voiceRecorder.openAppForMicPermission();
      return;
    }

    resetSession();

    const service = new SpeechmaticsVoiceService();
    serviceRef.current = service;

    service.setHandlers({
      onPartial: partial => {
        const {completeWords} = splitPartialWords(partial);
        insertCompletePartialWords(completeWords);
        updatePreview(partial);
      },
      onFinal: text => {
        const words = text.trim().split(/\s+/).filter(Boolean);
        for (let i = segmentInsertedCountRef.current; i < words.length; i++) {
          insertWord(words[i]);
          committedWordsRef.current.push(words[i]);
        }
        segmentInsertedCountRef.current = 0;
        setPartialTranscript(
          committedWordsRef.current.slice(-4).join(' '),
        );
      },
      onError: () => {
        void stopListening();
      },
    });

    try {
      await service.start(SPEECHMATICS_API_KEY);
      unsubscribeRef.current = voiceRecorder.subscribe(base64 => {
        service.sendAudioBase64(base64);
      });
      await voiceRecorder.start();
      setIsListening(true);
    } catch {
      await stopListening();
    }
  }, [
    insertCompletePartialWords,
    insertWord,
    resetSession,
    stopListening,
    updatePreview,
  ]);

  const toggleListening = useCallback(async () => {
    if (isListening) {
      await stopListening();
    } else {
      await startListening();
    }
  }, [isListening, startListening, stopListening]);

  useEffect(() => {
    return () => {
      void stopListening();
    };
  }, [stopListening]);

  return {isListening, partialTranscript, toggleListening};
}
