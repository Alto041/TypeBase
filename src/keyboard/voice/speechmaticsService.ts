import {Buffer} from 'buffer';
import {createSpeechmaticsJWT} from '@speechmatics/auth';
import {
  SPEECHMATICS_LANGUAGE_TRY_ORDER,
  type SpeechmaticsLanguageCode,
} from './speechmaticsLanguages';

const WS_URL = 'wss://eu2.rt.speechmatics.com/v2';
const START_TIMEOUT_MS = 10000;
const END_OF_TRANSCRIPT_TIMEOUT_MS = 4000;

const AUDIO_FORMAT = {
  type: 'raw' as const,
  encoding: 'pcm_s16le' as const,
  sample_rate: 16000,
};

type TranscriptMetadata = {
  transcript?: string;
};

type ServerMessage = {
  message: string;
  reason?: string;
  type?: string;
  seq_no?: number;
  metadata?: TranscriptMetadata;
};

export type VoiceTranscriptHandlers = {
  onPartial?: (text: string) => void;
  onFinal?: (text: string) => void;
  onError?: (message: string) => void;
  onLanguageResolved?: (language: SpeechmaticsLanguageCode) => void;
};

function connectSocket(jwt: string): Promise<WebSocket> {
  const url = `${WS_URL}?jwt=${encodeURIComponent(jwt)}`;
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);

    const onOpen = () => {
      cleanup();
      resolve(socket);
    };

    const onError = () => {
      cleanup();
      reject(new Error('WebSocket connection failed'));
    };

    const cleanup = () => {
      socket.removeEventListener('open', onOpen);
      socket.removeEventListener('error', onError);
    };

    socket.addEventListener('open', onOpen);
    socket.addEventListener('error', onError);
  });
}

function isInvalidLanguageError(data: ServerMessage): boolean {
  return (
    data.message === 'Error' &&
    (data.type === 'invalid_language' || data.type === 'invalid_config')
  );
}

export class SpeechmaticsVoiceService {
  private socket: WebSocket | null = null;
  private lastAudioAddedSeqNo = 0;
  private sentAudioSeqNo = 0;
  private handlers: VoiceTranscriptHandlers = {};
  private messageListener: ((event: MessageEvent) => void) | null = null;
  private recognitionStarted = false;
  private stopping = false;
  private activeLanguage: SpeechmaticsLanguageCode = 'en';

  setHandlers(handlers: VoiceTranscriptHandlers) {
    this.handlers = handlers;
  }

  getActiveLanguage(): SpeechmaticsLanguageCode {
    return this.activeLanguage;
  }

  async start(apiKey: string): Promise<void> {
    let lastError: Error | null = null;

    for (const language of SPEECHMATICS_LANGUAGE_TRY_ORDER) {
      try {
        await this.startWithLanguage(apiKey, language);
        return;
      } catch (error) {
        lastError =
          error instanceof Error ? error : new Error('Speechmatics start failed');
        if (language === 'auto') {
          continue;
        }
        throw lastError;
      }
    }

    throw lastError ?? new Error('Speechmatics start failed');
  }

  private async startWithLanguage(
    apiKey: string,
    language: SpeechmaticsLanguageCode,
  ): Promise<void> {
    await this.stop();

    const jwt = await createSpeechmaticsJWT({type: 'rt', apiKey, ttl: 300});
    const socket = await connectSocket(jwt);
    this.socket = socket;
    this.recognitionStarted = false;
    this.sentAudioSeqNo = 0;
    this.lastAudioAddedSeqNo = 0;
    this.activeLanguage = language;

    const started = new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Timed out waiting for RecognitionStarted'));
      }, START_TIMEOUT_MS);

      this.messageListener = (event: MessageEvent) => {
        const data = JSON.parse(String(event.data)) as ServerMessage;

        if (data.message === 'RecognitionStarted' && !this.recognitionStarted) {
          this.recognitionStarted = true;
          clearTimeout(timeout);
          this.handlers.onLanguageResolved?.(language);
          resolve();
          return;
        }

        if (!this.recognitionStarted && data.message === 'Error') {
          clearTimeout(timeout);
          if (language === 'auto' && isInvalidLanguageError(data)) {
            reject(new Error('invalid_language'));
            return;
          }
          reject(new Error(data.reason ?? 'Speechmatics error'));
          return;
        }

        this.handleServerMessage(data);
      };

      socket.addEventListener('message', this.messageListener);
    });

    socket.send(
      JSON.stringify({
        message: 'StartRecognition',
        audio_format: AUDIO_FORMAT,
        transcription_config: {
          language,
          operating_point: 'enhanced',
          max_delay: 0.7,
          max_delay_mode: 'flexible',
          enable_partials: true,
        },
      }),
    );

    await started;
  }

  private handleServerMessage(data: ServerMessage) {
    if (data.message === 'AudioAdded' && data.seq_no != null) {
      this.lastAudioAddedSeqNo = data.seq_no;
      return;
    }

    const transcript = data.metadata?.transcript?.trim();

    if (data.message === 'AddTranscript') {
      if (transcript) {
        this.handlers.onFinal?.(transcript);
      }
      return;
    }

    if (data.message === 'AddPartialTranscript') {
      if (transcript) {
        this.handlers.onPartial?.(transcript);
      }
      return;
    }

    if (data.message === 'Error') {
      if (this.stopping) {
        return;
      }
      this.handlers.onError?.(data.reason ?? 'Speechmatics error');
    }
  }

  sendAudioBase64(base64: string) {
    const socket = this.socket;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      return;
    }
    socket.send(Buffer.from(base64, 'base64'));
    this.sentAudioSeqNo += 1;
  }

  private endOfStreamSeqNo(): number {
    return Math.max(this.lastAudioAddedSeqNo, this.sentAudioSeqNo);
  }

  private teardownSocket(socket: WebSocket) {
    this.socket = null;
    this.recognitionStarted = false;
    this.messageListener = null;
    this.lastAudioAddedSeqNo = 0;
    this.sentAudioSeqNo = 0;

    if (
      socket.readyState === WebSocket.OPEN ||
      socket.readyState === WebSocket.CLOSING
    ) {
      socket.close();
    }
  }

  /** Ends the stream and waits for trailing finals before closing. */
  async stop(): Promise<void> {
    const socket = this.socket;
    if (!socket) {
      return;
    }

    this.stopping = true;

    if (socket.readyState !== WebSocket.OPEN) {
      this.teardownSocket(socket);
      this.stopping = false;
      return;
    }

    await new Promise<void>(resolve => {
      const finishStop = () => {
        clearTimeout(timeout);
        socket.removeEventListener('message', flushListener);
        this.teardownSocket(socket);
        this.stopping = false;
        resolve();
      };

      const timeout = setTimeout(finishStop, END_OF_TRANSCRIPT_TIMEOUT_MS);

      const flushListener = (event: MessageEvent) => {
        const data = JSON.parse(String(event.data)) as ServerMessage;
        this.handleServerMessage(data);

        if (data.message === 'EndOfTranscript') {
          finishStop();
        }
      };

      if (this.messageListener) {
        socket.removeEventListener('message', this.messageListener);
        this.messageListener = null;
      }

      socket.addEventListener('message', flushListener);

      try {
        socket.send(
          JSON.stringify({
            message: 'EndOfStream',
            last_seq_no: this.endOfStreamSeqNo(),
          }),
        );
      } catch {
        finishStop();
      }
    });
  }
}
