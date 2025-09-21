import type { EventBus } from "../domain/events/EventBus";
import { Topics } from "../domain/events/EventBus";
import type { AudioInputPort } from "../ports/audio/AudioInputPort";
import type { WakeWordPort } from "../ports/speech/WakeWordPort";
import type { STTPort } from "../ports/speech/STTPort";

const PCM_FRAME_BYTES = 2;

export interface VoiceAssistantOptions {
  wakeWordCooldownMs?: number;
}

export class VoiceAssistant {
  private listening = false;
  private lastWakeWord = 0;

  constructor(
    private readonly bus: EventBus,
    private readonly audioIn: AudioInputPort,
    private readonly wakeWord: WakeWordPort,
    private readonly stt: STTPort,
    private readonly options: VoiceAssistantOptions = {}
  ) {}

  async start() {
    await this.audioIn.start();
    await this.stt.start();

    this.audioIn.onChunk((chunk) => this.handleChunk(chunk));

    this.stt.onTranscript((transcript) => {
      if (!transcript.trim()) return;
      this.listening = false;
      this.bus.publish(Topics.UtteranceCaptured, transcript.trim());
    });

    this.bus.subscribe(Topics.WakeWordDetected, () => {
      // stop any currently playing alarms via published event from alarm manager
    });
  }

  async stop() {
    await this.audioIn.stop().catch(() => {});
    await this.stt.stop().catch(() => {});
  }

  private handleChunk(chunk: Buffer) {
    if (!this.listening) {
      const frame = this.toPcm(chunk);
      if (this.wakeWord.processPcm(frame)) {
        const now = Date.now();
        const cooldown = this.options.wakeWordCooldownMs ?? 1500;
        if (now - this.lastWakeWord > cooldown) {
          this.lastWakeWord = now;
          this.listening = true;
          this.bus.publish(Topics.WakeWordDetected, {});
        }
      }
      return;
    }

    this.stt.sendPcm(chunk);
  }

  private toPcm(buffer: Buffer): Int16Array {
    const samples = buffer.length / PCM_FRAME_BYTES;
    const pcm = new Int16Array(samples);
    for (let i = 0; i < samples; i++) {
      pcm[i] = buffer.readInt16LE(i * PCM_FRAME_BYTES);
    }
    return pcm;
  }
}
