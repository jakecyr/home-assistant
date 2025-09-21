import { AssemblyAI, StreamingTranscriber } from "assemblyai";
import type { STTPort, TranscriptHandler } from "../../ports/speech/STTPort";

export interface AssemblyAiOptions {
  apiKey: string;
  sampleRate?: number;
}

export class AssemblyAiSTT implements STTPort {
  private readonly client: AssemblyAI;
  private transcriber: StreamingTranscriber | null = null;
  private handlers = new Set<TranscriptHandler>();
  private ready = false;
  private buffer = Buffer.alloc(0);
  private restarting = false;
  private sampleRate: number;

  constructor(options: AssemblyAiOptions) {
    this.client = new AssemblyAI({ apiKey: options.apiKey });
    this.sampleRate = options.sampleRate ?? 16000;
  }

  async start(): Promise<void> {
    if (this.transcriber) return;
    await this.openSession();
  }

  async stop(): Promise<void> {
    const transcriber = this.transcriber;
    if (!transcriber) return;
    this.transcriber = null;
    this.ready = false;
    try {
      await transcriber.close(false);
    } catch (err) {
      console.warn("Failed to close AssemblyAI transcriber:", err);
    }
  }

  sendPcm(chunk: Buffer): void {
    if (!this.transcriber || !this.ready) {
      this.buffer = Buffer.concat([this.buffer, chunk]);
      return;
    }

    try {
      this.transcriber.sendAudio(chunk.buffer.slice(chunk.byteOffset, chunk.byteOffset + chunk.byteLength));
    } catch (err) {
      console.error("Failed to stream audio frame:", err);
    }
  }

  onTranscript(handler: TranscriptHandler): () => void {
    this.handlers.add(handler);
    return () => {
      this.handlers.delete(handler);
    };
  }

  private async openSession() {
    if (this.transcriber || this.restarting) return;
    this.restarting = true;
    try {
      const transcriber = this.client.streaming.transcriber({
        sampleRate: this.sampleRate,
        formatTurns: true,
        encoding: "pcm_s16le",
        maxTurnSilence: 10000,
        minEndOfTurnSilenceWhenConfident: 2000,
      });
      this.attach(transcriber);
      await transcriber.connect();
      this.transcriber = transcriber;
    } finally {
      this.restarting = false;
    }
  }

  private attach(transcriber: StreamingTranscriber) {
    let latestTranscript = "";
    let formattedTranscript = "";

    transcriber.on("open", () => {
      if (this.transcriber === transcriber) {
        this.ready = true;
        this.flushBuffer();
      }
    });

    transcriber.on("turn", (turn) => {
      if (typeof turn.transcript === "string" && turn.transcript.length) {
        if (turn.turn_is_formatted) {
          if (turn.transcript.length >= formattedTranscript.length) {
            formattedTranscript = turn.transcript;
          }
        } else if (turn.transcript.length >= latestTranscript.length) {
          latestTranscript = turn.transcript;
        }
      }

      if (turn.end_of_turn && turn.turn_is_formatted) {
        const best = formattedTranscript.length >= latestTranscript.length
          ? formattedTranscript
          : latestTranscript;
        const finalText = (best || "").trim();
        if (finalText) {
          for (const handler of this.handlers) {
            try {
              handler(finalText);
            } catch (err) {
              console.warn("Transcript handler failed:", err);
            }
          }
        }
        this.restart();
      }
    });

    transcriber.on("error", (err) => {
      console.error("AssemblyAI transcriber error:", err);
      this.restart();
    });

    transcriber.on("close", () => {
      this.restart();
    });
  }

  private flushBuffer() {
    if (!this.transcriber || !this.ready) return;
    if (!this.buffer.length) return;
    try {
      this.transcriber.sendAudio(
        this.buffer.buffer.slice(this.buffer.byteOffset, this.buffer.byteOffset + this.buffer.byteLength)
      );
    } catch (err) {
      console.error("Failed to flush buffered audio:", err);
    } finally {
      this.buffer = Buffer.alloc(0);
    }
  }

  private async restart() {
    const transcriber = this.transcriber;
    if (transcriber) {
      this.transcriber = null;
      this.ready = false;
      try {
        await transcriber.close(false);
      } catch {}
    }
    this.buffer = Buffer.alloc(0);
    await this.openSession();
  }
}
