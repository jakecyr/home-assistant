import { promises as fs } from "fs";
import type { AssistantAction } from "../shared/contracts";
import type { AudioOutputPort } from "../ports/audio/AudioOutputPort";
import type { TTSPort } from "../ports/speech/TTSPort";
import { OpenAIRealtimeTTS } from "../adapters/speech/OpenAIRealtimeTTS";

export interface SpeechRendererOptions {
  sampleRate?: number;
  voiceEnabled?: boolean;
}

export class SpeechRenderer {
  private readonly sampleRate: number;
  private readonly voiceEnabled: boolean;
  private realtimeStreamingAvailable = true;

  constructor(
    private readonly audioOut: AudioOutputPort,
    private readonly realtimeTts: OpenAIRealtimeTTS,
    private readonly fallbackTts: TTSPort,
    options: SpeechRendererOptions = {}
  ) {
    this.sampleRate = options.sampleRate ?? 16000;
    this.voiceEnabled = options.voiceEnabled ?? true;
  }

  async render(action: AssistantAction): Promise<void> {
    const text = this.pickUtterance(action);
    if (!text) return;

    if (!this.voiceEnabled) {
      console.log(`💬 ${text}`);
      return;
    }

    const streamingSupported =
      typeof this.audioOut.supportsRealtimeStreaming === "function"
        ? this.audioOut.supportsRealtimeStreaming()
        : true;

    if (
      this.realtimeStreamingAvailable &&
      typeof this.audioOut.playStream === "function" &&
      streamingSupported
    ) {
      try {
        const stream = await this.realtimeTts.stream(text);
        await this.audioOut.playStream(stream, {
          sampleRate: this.sampleRate,
        });
        return;
      } catch (err) {
        console.warn("Realtime TTS failed; falling back to file playback:", err);
        if (err instanceof Error && /does not support streamed playback/i.test(err.message)) {
          this.realtimeStreamingAvailable = false;
        }
      }
    }

    const wavPath = await this.fallbackTts.synthesize(text);
    try {
      await this.audioOut.play(wavPath);
    } finally {
      await fs.unlink(wavPath).catch(() => {});
    }
  }

  private pickUtterance(action: AssistantAction): string {
    return action.reply_text?.trim() ?? "";
  }
}
