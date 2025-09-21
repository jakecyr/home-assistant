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
  private pendingAudio = Buffer.alloc(0);
  private restarting = false;
  private sampleRate: number;
  private readonly minChunkBytes: number;

  constructor(options: AssemblyAiOptions) {
    this.client = new AssemblyAI({ apiKey: options.apiKey });
    this.sampleRate = options.sampleRate ?? 16000;
    this.minChunkBytes = Math.max(1, Math.round((this.sampleRate / 20) * 2)); // 50ms chunks
  }

  async start(): Promise<void> {
    if (this.transcriber) return;
    console.log("[AAI] Starting streaming session...");
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
    if (!chunk.length) return;
    if (!this.transcriber || !this.ready) {
      this.buffer = Buffer.concat([this.buffer, chunk]);
      if (!this.ready && chunk.length) {
        this.debugLog(`Buffered ${chunk.length} bytes (ready=${this.ready}).`);
      }
      return;
    }

    try {
      this.enqueueAudio(chunk);
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
      this.transcriber = transcriber;
      this.attach(transcriber);
      try {
        await transcriber.connect();
        console.log("[AAI] Streaming transcriber connected.");
      } catch (err) {
        console.error("[AAI] Failed to connect streaming transcriber:", err);
        try {
          await transcriber.close(false);
        } catch {}
        if (this.transcriber === transcriber) {
          this.transcriber = null;
        }
        throw err;
      }
    } finally {
      this.restarting = false;
    }
  }

  private attach(transcriber: StreamingTranscriber) {
    let latestTranscript = "";
    let formattedTranscript = "";

    transcriber.on("open", () => {
      this.ready = true;
      console.log("🎧 AssemblyAI session ready—start speaking.");
      this.flushBuffer();
    });

    transcriber.on("turn", (turn) => {
      this.debugLog(
        `[turn] order=${turn.turn_order} formatted=${turn.turn_is_formatted} end=${turn.end_of_turn} transcript="${turn.transcript || ''}"`
      );
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

    transcriber.on("close", (code: number, reason: string) => {
      console.warn(
        `[AAI] Streaming transcriber closed (code=${code} reason=${reason}); restarting.`
      );
      this.restart();
    });
  }

  private flushBuffer() {
    if (!this.transcriber || !this.ready) return;
    if (!this.buffer.length) return;
    try {
      this.enqueueAudio(this.buffer);
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
    this.pendingAudio = Buffer.alloc(0);
    console.log("[AAI] Restarting streaming session...");
    await this.openSession();
  }

  private debugLog(message: string) {
    if (process.env.DEBUG_MODE === "true") {
      console.log(`[AAI][debug] ${message}`);
    }
  }

  private enqueueAudio(chunk: Buffer) {
    this.pendingAudio = this.pendingAudio.length
      ? Buffer.concat([this.pendingAudio, chunk])
      : Buffer.from(chunk); // copy to avoid holding onto large buffers

    while (this.pendingAudio.length >= this.minChunkBytes) {
      const slice = this.pendingAudio.subarray(0, this.minChunkBytes);
      this.pendingAudio = this.pendingAudio.subarray(this.minChunkBytes);
      if (this.transcriber) {
        this.debugLog(`Sending ${slice.length} bytes to AssemblyAI.`);
        this.transcriber.sendAudio(slice.buffer.slice(slice.byteOffset, slice.byteOffset + slice.byteLength));
      }
    }
  }
}
