import { promises as fs } from "fs";
import type { AssistantAction } from "../shared/contracts";
import type { AudioOutputPort } from "../ports/audio/AudioOutputPort";
import type { TTSPort } from "../ports/speech/TTSPort";
import { OpenAIRealtimeTTS } from "../adapters/speech/OpenAIRealtimeTTS";

export interface SpeechRendererOptions {
  sampleRate?: number;
}

export class SpeechRenderer {
  private readonly sampleRate: number;

  constructor(
    private readonly audioOut: AudioOutputPort,
    private readonly realtimeTts: OpenAIRealtimeTTS,
    private readonly fallbackTts: TTSPort,
    options: SpeechRendererOptions = {}
  ) {
    this.sampleRate = options.sampleRate ?? 16000;
  }

  async render(action: AssistantAction): Promise<void> {
    const text = this.pickUtterance(action);
    if (!text) return;

    if (typeof this.audioOut.playStream === "function") {
      try {
        const stream = await this.realtimeTts.stream(text, {
          ssml: action.speak_ssml,
        });
        await this.audioOut.playStream(stream, {
          sampleRate: this.sampleRate,
        });
        return;
      } catch (err) {
        console.warn("Realtime TTS failed; falling back to file playback:", err);
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
