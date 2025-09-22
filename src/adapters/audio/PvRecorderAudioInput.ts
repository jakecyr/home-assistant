import { PvRecorder } from "@picovoice/pvrecorder-node";
import type { AudioInputPort, AudioChunkHandler } from "../../ports/audio/AudioInputPort";

export interface PvRecorderAudioInputOptions {
  deviceLabel?: string;
  frameLength: number;
}

export class PvRecorderAudioInput implements AudioInputPort {
  private recorder: PvRecorder | null = null;
  private handlers = new Set<AudioChunkHandler>();
  private loopPromise: Promise<void> | null = null;

  constructor(private readonly options: PvRecorderAudioInputOptions) {}

  async start(): Promise<void> {
    if (this.recorder) return;

    const deviceIndex = resolveAudioDeviceIndex(this.options.deviceLabel);
    const recorder = new PvRecorder(this.options.frameLength, deviceIndex);
    recorder.start();
    console.log(`🎙️  Using microphone: ${recorder.getSelectedDevice()}`);
    this.recorder = recorder;
    this.loopPromise = this.pumpAudio(recorder);
    this.loopPromise.catch((err) => {
      console.error("Audio loop error:", err);
    });
  }

  async stop(): Promise<void> {
    const recorder = this.recorder;
    if (!recorder) return;
    this.recorder = null;
    try {
      recorder.stop();
      recorder.release();
    } catch (err) {
      console.warn("Failed to stop PvRecorder:", err);
    }
  }

  onChunk(handler: AudioChunkHandler): () => void {
    this.handlers.add(handler);
    return () => {
      this.handlers.delete(handler);
    };
  }

  private async pumpAudio(recorder: PvRecorder) {
    while (this.recorder === recorder && recorder.isRecording) {
      const pcm = await recorder.read();
      if (!this.recorder || !this.recorder.isRecording) break;
      const chunk = Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength);
      for (const handler of this.handlers) {
        try {
          handler(chunk);
        } catch (err) {
          console.warn("Audio chunk handler failed:", err);
        }
      }
    }
  }
}

function resolveAudioDeviceIndex(label?: string): number {
  if (!label || label.toLowerCase() === "default") return -1;
  if (/^-?\d+$/.test(label)) return Number.parseInt(label, 10);

  try {
    const devices = PvRecorder.getAvailableDevices();
    const idx = devices.findIndex((name) => name.toLowerCase().includes(label.toLowerCase()));
    if (idx >= 0) {
      console.log(`🎛️  Audio device matched "${label}": [${idx}] ${devices[idx]}`);
      return idx;
    }
    console.warn(
      `Audio device "${label}" not found. Falling back to default. Available devices:\n${devices
        .map((name, i) => `  [${i}] ${name}`)
        .join("\n")}`
    );
  } catch (err) {
    console.warn(`Could not enumerate audio devices (${(err as Error).message}). Falling back to default.`);
  }
  return -1;
}
