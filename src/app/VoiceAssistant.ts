import type { EventBus } from "../domain/events/EventBus";
import { Topics } from "../domain/events/EventBus";
import type { AudioInputPort } from "../ports/audio/AudioInputPort";
import type { WakeWordPort } from "../ports/speech/WakeWordPort";
import type { STTPort } from "../ports/speech/STTPort";

const PCM_FRAME_BYTES = 2;

export interface VoiceAssistantOptions {
  wakeWordCooldownMs?: number;
  startListeningOnLaunch?: boolean;
}

export class VoiceAssistant {
  private listening = false;
  private lastWakeWord = 0;
  private chunkCounter = 0;
  private streamLogPrinted = false;

  constructor(
    private readonly bus: EventBus,
    private readonly audioIn: AudioInputPort,
    private readonly wakeWord: WakeWordPort | undefined,
    private readonly stt: STTPort,
    private readonly options: VoiceAssistantOptions = {}
  ) {}

  async start() {
    await this.audioIn.start();
    await this.stt.start();

    console.log(
      `Voice assistant started (wakeWord=${Boolean(this.wakeWord)}, auto=${this.options.startListeningOnLaunch}).`
    );

    this.audioIn.onChunk((chunk) => this.handleChunk(chunk));

    this.stt.onTranscript((transcript) => {
      if (!transcript.trim()) return;
      this.listening = false;
      console.log(`📝 Transcript: ${transcript.trim()}`);
      this.bus.publish(Topics.UtteranceCaptured, transcript.trim());
    });

    this.bus.subscribe(Topics.WakeWordDetected, () => {
      // stop any currently playing alarms via published event from alarm manager
    });

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
      if (!this.listening) {
        this.enableListening('auto-listen');
      }
      this.stt.sendPcm(chunk);
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
    if (this.listening) return;
    this.listening = true;
    this.lastWakeWord = Date.now();
    console.log(
      trigger === 'auto-listen'
        ? '🎤 Auto-listen engaged — streaming audio to STT.'
        : '🔔 Wake word detected — listening for command.'
    );
    this.bus.publish(Topics.WakeWordDetected, { trigger });
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
}
