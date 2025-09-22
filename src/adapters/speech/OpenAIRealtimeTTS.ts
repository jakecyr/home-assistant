import { EventEmitter } from "events";
import WebSocket from "ws";
import { OPENAI_API_KEY, OPENAI_VOICE_MODEL, OPENAI_VOICE_NAME } from "../../env";

interface StreamOptions {
  ssml?: string;
}

interface AudioStream extends AsyncIterable<Buffer> {}

export class OpenAIRealtimeTTS {
  constructor(
    private readonly endpoint: string = "wss://api.openai.com/v1/realtime"
  ) {}

  async stream(text: string, options: StreamOptions = {}): Promise<AudioStream> {
    const cleaned = (options.ssml ?? text).trim();
    if (!cleaned) {
      return (async function* () {})();
    }

    if (!OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY is not set for realtime TTS.");
    }
    if (!OPENAI_VOICE_MODEL) {
      throw new Error("OPENAI_VOICE_MODEL is not configured.");
    }

    const url = `${this.endpoint}?model=${encodeURIComponent(OPENAI_VOICE_MODEL)}`;

    const ws = new WebSocket(url, {
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "OpenAI-Beta": "realtime=v1",
      },
    });

    await onceOpen(ws);

    const voiceName = OPENAI_VOICE_NAME || "alloy";

    ws.send(
      JSON.stringify({
        type: "session.update",
        session: {
          voice: voiceName,
          default_output_audio_format: "pcm16",
        },
      })
    );

    ws.send(
      JSON.stringify({
        type: "response.create",
        response: {
          modalities: ["audio"],
          instructions: cleaned,
        },
      })
    );

    const queue: Buffer[] = [];
    let finished = false;
    let error: Error | null = null;
    const emitter = new EventEmitter();

    ws.on("message", (data) => {
      try {
        const payload = JSON.parse(data.toString());
        if (payload.type === "response.output_audio.delta" && payload.delta?.audio) {
          const buffer = Buffer.from(payload.delta.audio, "base64");
          queue.push(buffer);
          emitter.emit("chunk");
        } else if (
          payload.type === "response.completed" ||
          payload.type === "response.final" ||
          payload.type === "response.output_audio.done"
        ) {
          finished = true;
          emitter.emit("chunk");
        } else if (payload.type === "error") {
          error = new Error(payload.error?.message || "Realtime error");
          finished = true;
          emitter.emit("chunk");
        }
      } catch (err) {
        error = err as Error;
        finished = true;
        emitter.emit("chunk");
      }
    });

    ws.on("error", (err) => {
      if (!error) {
        error = err as Error;
      }
      finished = true;
      emitter.emit("chunk");
    });

    ws.on("close", () => {
      finished = true;
      emitter.emit("chunk");
    });

    const iterator = async function* (): AsyncIterableIterator<Buffer> {
      try {
        while (true) {
          if (queue.length) {
            yield queue.shift()!;
            continue;
          }
          if (finished) {
            if (error) throw error;
            break;
          }
          await once(emitter, "chunk");
        }
      } finally {
        if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
          ws.close();
        }
      }
    };

    return iterator();
  }
}

function onceOpen(ws: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    ws.once("open", () => resolve());
    ws.once("error", (err) => reject(err));
  });
}

function once(emitter: EventEmitter, event: string): Promise<void> {
  return new Promise((resolve) => {
    emitter.once(event, () => resolve());
  });
}
