import type { EventBus, Subscription } from "../domain/events/EventBus";
import { Topics } from "../domain/events/EventBus";
import type { AudioInputPort } from "../ports/audio/AudioInputPort";
import type {
  AudioOutputPort,
  ToneOptions,
} from "../ports/audio/AudioOutputPort";
import type { WakeWordPort } from "../ports/speech/WakeWordPort";
import type { STTPort } from "../ports/speech/STTPort";

const PCM_FRAME_BYTES = 2;

export interface VoiceAssistantOptions {
  wakeWordCooldownMs?: number;
  startListeningOnLaunch?: boolean;
  listeningCue?: ListeningCueOptions;
  resumeListeningDelayMs?: number;
}

interface ListeningCueOptions {
  enabled?: boolean;
  start?: Partial<ToneOptions>;
  stop?: Partial<ToneOptions>;
}

interface ListeningCueConfig {
  enabled: boolean;
  start: ToneOptions;
  stop: ToneOptions;
}

interface AssistantSpeakingEvent {
  speaking: boolean;
}

export class VoiceAssistant {
  private listening = false;
  private lastWakeWord = 0;
  private chunkCounter = 0;
  private streamLogPrinted = false;
  private removeChunkHandler: (() => void) | null = null;
  private removeTranscriptHandler: (() => void) | null = null;
  private assistantSpeakingSub: Subscription | null = null;
  private cueQueue: Promise<void> = Promise.resolve();
  private readonly listeningCues: ListeningCueConfig;
  private readonly resumeListeningDelayMs: number;
  private suspended = false;
  private resumeTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly bus: EventBus,
    private readonly audioIn: AudioInputPort,
    private readonly audioOut: AudioOutputPort,
    private readonly wakeWord: WakeWordPort | undefined,
    private readonly stt: STTPort,
    private readonly options: VoiceAssistantOptions = {}
  ) {
    const startDefaults: ToneOptions = { frequency: 1175, ms: 110, volume: 0.28 };
    const stopDefaults: ToneOptions = { frequency: 880, ms: 160, volume: 0.24 };
    const cueOptions = options.listeningCue ?? {};

    const startCue: ToneOptions = {
      ...startDefaults,
      ...(cueOptions.start ?? {}),
    };
    const stopCue: ToneOptions = {
      ...stopDefaults,
      ...(cueOptions.stop ?? {}),
    };

    this.listeningCues = {
      enabled: cueOptions.enabled ?? true,
      start: startCue,
      stop: stopCue,
    };

    this.resumeListeningDelayMs = Math.max(0, this.options.resumeListeningDelayMs ?? 250);
  }

  async start() {
    await this.audioIn.start();
    await this.stt.start();

    console.log(
      `Voice assistant started (wakeWord=${Boolean(this.wakeWord)}, auto=${this.options.startListeningOnLaunch}).`
    );
    this.unhook();
    this.removeChunkHandler = this.audioIn.onChunk((chunk) => this.handleChunk(chunk));

    this.removeTranscriptHandler = this.stt.onTranscript((transcript) => {
      const trimmed = transcript.trim();
      if (!trimmed) return;
      this.suspendListening();
      console.log(`📝 Transcript: ${trimmed}`);
      this.bus.publish(Topics.UtteranceCaptured, trimmed);
    });

    this.assistantSpeakingSub = this.bus.subscribe<AssistantSpeakingEvent>(
      Topics.AssistantSpeaking,
      (event) => this.handleAssistantSpeaking(event)
    );

    if (this.options.startListeningOnLaunch && !this.wakeWord) {
      console.log(
        `Auto-listen bootstrap (startListeningOnLaunch=${this.options.startListeningOnLaunch}).`
      );
      this.enableListening('auto-listen');
      this.stt.sendPcm(Buffer.alloc(0));
    }
  }

  async stop() {
    await this.audioIn.stop().catch(() => {});
    await this.stt.stop().catch(() => {});
    this.unhook();
    this.clearResumeTimer();
    this.suspended = false;
  }

  private handleChunk(chunk: Buffer) {
    if (!this.wakeWord) {
      this.chunkCounter += 1;
      if (!this.streamLogPrinted) {
        console.log(
          `Auto-listen chunk #${this.chunkCounter} (size=${chunk.length} bytes)`
        );
        if (this.chunkCounter > 3) this.streamLogPrinted = true;
      }
      if (chunk.length === 0) {
        return;
      }
      if (!this.streamLogPrinted && this.chunkCounter % 10 === 0) {
        const rms = this.calculateRms(chunk);
        console.log(`Auto-listen RMS ≈ ${rms.toFixed(2)}`);
      }
      if (this.suspended) {
        return;
      }
      if (!this.listening) {
        this.enableListening('auto-listen');
      }
      this.stt.sendPcm(chunk);
      return;
    }

    if (this.suspended) {
      return;
    }

    if (!this.listening) {
      const frame = this.toPcm(chunk);
      if (this.wakeWord.processPcm(frame)) {
        const now = Date.now();
        const cooldown = this.options.wakeWordCooldownMs ?? 1500;
        if (now - this.lastWakeWord > cooldown) {
          this.lastWakeWord = now;
          this.enableListening('wake-word');
        }
      }
      return;
    }

    this.stt.sendPcm(chunk);
  }

  private enableListening(trigger: 'wake-word' | 'auto-listen') {
    if (this.listening || this.suspended) return;
    this.listening = true;
    this.lastWakeWord = Date.now();
    console.log(
      trigger === 'auto-listen'
        ? '🎤 Auto-listen engaged — streaming audio to STT.'
        : '🔔 Wake word detected — listening for command.'
    );
    this.bus.publish(Topics.WakeWordDetected, { trigger });
    this.scheduleCue('start');
  }

  private toPcm(buffer: Buffer): Int16Array {
    const samples = buffer.length / PCM_FRAME_BYTES;
    const pcm = new Int16Array(samples);
    for (let i = 0; i < samples; i++) {
      pcm[i] = buffer.readInt16LE(i * PCM_FRAME_BYTES);
    }
    return pcm;
  }

  private calculateRms(buffer: Buffer): number {
    if (!buffer.length) return 0;
    const samples = buffer.length / PCM_FRAME_BYTES;
    let sumSquares = 0;
    for (let i = 0; i < samples; i++) {
      const sample = buffer.readInt16LE(i * PCM_FRAME_BYTES);
      sumSquares += sample * sample;
    }
    return Math.sqrt(sumSquares / samples) / 32768;
  }

  private disableListening() {
    if (!this.listening) return;
    this.listening = false;
    this.scheduleCue('stop');
  }

  private scheduleCue(kind: 'start' | 'stop') {
    if (!this.listeningCues.enabled) return;
    this.cueQueue = this.cueQueue
      .catch(() => {})
      .then(() => this.playCue(kind));
  }

  private async playCue(kind: 'start' | 'stop') {
    try {
      const toneName = kind === 'start' ? 'listen-start' : 'listen-stop';
      const toneOptions = kind === 'start' ? this.listeningCues.start : this.listeningCues.stop;
      const toneFile = await this.audioOut.prepareTone(toneName, toneOptions);
      await this.audioOut.play(toneFile);
    } catch (err) {
      console.warn(`Failed to play listening ${kind} cue:`, err);
    }
  }

  private handleAssistantSpeaking(event: AssistantSpeakingEvent) {
    if (event.speaking) {
      this.suspendListening();
      return;
    }

    this.scheduleResume();
  }

  private suspendListening() {
    this.suspended = true;
    this.clearResumeTimer();
    this.disableListening();
  }

  private scheduleResume() {
    this.clearResumeTimer();
    const delay = this.resumeListeningDelayMs;
    const resume = () => {
      this.resumeTimer = null;
      this.suspended = false;
      if (!this.wakeWord) {
        this.enableListening('auto-listen');
      }
    };
    if (delay === 0) {
      resume();
      return;
    }
    this.resumeTimer = setTimeout(resume, delay);
    if (typeof this.resumeTimer.unref === 'function') {
      this.resumeTimer.unref();
    }
  }

  private clearResumeTimer() {
    if (this.resumeTimer) {
      clearTimeout(this.resumeTimer);
      this.resumeTimer = null;
    }
  }

  private unhook() {
    this.removeChunkHandler?.();
    this.removeTranscriptHandler?.();
    this.assistantSpeakingSub?.unsubscribe();
    this.removeChunkHandler = null;
    this.removeTranscriptHandler = null;
    this.assistantSpeakingSub = null;
  }
}
