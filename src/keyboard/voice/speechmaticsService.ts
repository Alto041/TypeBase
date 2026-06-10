import {Buffer} from 'buffer';
import {createSpeechmaticsJWT} from '@speechmatics/auth';

const WS_URL = 'wss://eu2.rt.speechmatics.com/v2';
const START_TIMEOUT_MS = 10000;

const AUDIO_FORMAT = {
  type: 'raw' as const,
  encoding: 'pcm_s16le' as const,
  sample_rate: 16000,
};

type ServerMessage = {
  message: string;
  reason?: string;
  seq_no?: number;
  metadata?: {transcript?: string};
};

export type VoiceTranscriptHandlers = {
  onPartial?: (text: string) => void;
  onFinal?: (text: string) => void;
  onError?: (message: string) => void;
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

export class SpeechmaticsVoiceService {
  private socket: WebSocket | null = null;
  private lastAudioAddedSeqNo = 0;
  private handlers: VoiceTranscriptHandlers = {};
  private messageListener: ((event: MessageEvent) => void) | null = null;
  private recognitionStarted = false;

  setHandlers(handlers: VoiceTranscriptHandlers) {
    this.handlers = handlers;
  }

  async start(apiKey: string): Promise<void> {
    await this.stop();

    const jwt = await createSpeechmaticsJWT({type: 'rt', apiKey, ttl: 300});
    const socket = await connectSocket(jwt);
    this.socket = socket;
    this.recognitionStarted = false;

    const started = new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Timed out waiting for RecognitionStarted'));
      }, START_TIMEOUT_MS);

      this.messageListener = (event: MessageEvent) => {
        const data = JSON.parse(String(event.data)) as ServerMessage;

        if (data.message === 'RecognitionStarted' && !this.recognitionStarted) {
          this.recognitionStarted = true;
          clearTimeout(timeout);
          resolve();
          return;
        }

        if (!this.recognitionStarted && data.message === 'Error') {
          clearTimeout(timeout);
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
          language: 'en',
          max_delay: 0.7,
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

    if (data.message === 'AddTranscript') {
      const transcript = data.metadata?.transcript?.trim();
      if (transcript) {
        this.handlers.onFinal?.(transcript);
      }
      return;
    }

    if (data.message === 'AddPartialTranscript') {
      const transcript = data.metadata?.transcript?.trim();
      if (transcript) {
        this.handlers.onPartial?.(transcript);
      }
      return;
    }

    if (data.message === 'Error') {
      this.handlers.onError?.(data.reason ?? 'Speechmatics error');
    }
  }

  sendAudioBase64(base64: string) {
    const socket = this.socket;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      return;
    }
    socket.send(Buffer.from(base64, 'base64'));
  }

  async stop(): Promise<void> {
    const socket = this.socket;
    this.socket = null;
    this.recognitionStarted = false;

    if (!socket) {
      return;
    }

    if (this.messageListener) {
      socket.removeEventListener('message', this.messageListener);
      this.messageListener = null;
    }

    if (socket.readyState === WebSocket.OPEN) {
      try {
        socket.send(
          JSON.stringify({
            message: 'EndOfStream',
            last_seq_no: this.lastAudioAddedSeqNo,
          }),
        );
      } catch {
        // Socket may already be closing.
      }
      socket.close();
    }

    this.lastAudioAddedSeqNo = 0;
  }
}
