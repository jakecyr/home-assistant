import { promises as fs } from "fs";
import { tmpdir } from "os";
import path from "path";
import { spawn, spawnSync } from "child_process";
import { randomUUID } from "crypto";
import { loadTools } from "./tools";
import { runAgentWithTools } from "./agent/loop";
import { openai } from "./agent/openai";
import type { ChatCompletionMessageParam } from "openai/resources";
import { Porcupine } from "@picovoice/porcupine-node";
import { PvRecorder } from "@picovoice/pvrecorder-node";
import { AssemblyAI, StreamingTranscriber } from "assemblyai";
import {
  PICOVOICE_ACCESS_KEY,
  ASSEMBLYAI_API_KEY,
  OPENAI_API_KEY,
  AUDIO_DEVICE,
  TTS_VOICE,
} from "./env";

let registryPromise = loadTools(); // lazy-load once

const MAX_HISTORY_MESSAGES = 12; // keep the last 6 user/assistant pairs
let conversationHistory: ChatCompletionMessageParam[] = [];

function pushHistory(role: "user" | "assistant", content: string) {
  conversationHistory = [...conversationHistory, { role, content }];
  if (conversationHistory.length > MAX_HISTORY_MESSAGES) {
    conversationHistory = conversationHistory.slice(-MAX_HISTORY_MESSAGES);
  }
}

async function thinkAndAct(transcript: string): Promise<string> {
  const registry = await registryPromise;

  const ctx = {
    log: (...a: any[]) => console.log("[tool]", ...a),
  };

  const { finalText, turns } = await runAgentWithTools(
    transcript,
    registry,
    ctx,
    { maxTurns: 6, history: conversationHistory }
  );
  console.log(`🤖 (${turns} turn${turns === 1 ? "" : "s"}) ${finalText}`);
  pushHistory("user", transcript);
  if (finalText.trim()) pushHistory("assistant", finalText.trim());
  await speak(finalText);
  return finalText;
}

if (!PICOVOICE_ACCESS_KEY || !ASSEMBLYAI_API_KEY || !OPENAI_API_KEY) {
  console.error("Missing one or more API keys in .env");
  process.exit(1);
}

type State = "IDLE" | "LISTENING" | "THINKING" | "ACTING";
let state: State = "IDLE";

const SAMPLE_RATE = 16000; // 16 kHz mono PCM16
const AAI_CLIENT = new AssemblyAI({ apiKey: ASSEMBLYAI_API_KEY });
const TTS_MODEL = "gpt-4o-mini-tts";

type EarconType = "start" | "stop";

// ---- Porcupine (wake word "Jarvis")
const porcupine = new Porcupine(
  PICOVOICE_ACCESS_KEY,
  ["jarvis"],
  [0.6] // sensitivity (0..1)
);

let recorder: PvRecorder | null = null;
let audioLoopPromise: Promise<void> | null = null;
let transcriber: StreamingTranscriber | null = null;
let transcriberReady = false;
let activeConversation: Promise<void> | null = null;
let conversationBuffer = Buffer.alloc(0);

// Buffers dedicated to each stage
let idleBuf = Buffer.alloc(0); // for Porcupine frames
const PPN_FRAME_BYTES = porcupine.frameLength * 2; // int16 -> bytes
const AAI_FRAME_BYTES = (SAMPLE_RATE / 20) * 2; // 50ms * 2 bytes/sample

// AAI session state
let finalTranscript: string | null = null;

type AudioPlayer = {
  command: string;
  makeArgs: (file: string) => string[];
};

const PLAYER_CANDIDATES: AudioPlayer[] =
  process.platform === "darwin"
    ? [
        { command: "afplay", makeArgs: (file) => [file] },
        {
          command: "ffplay",
          makeArgs: (file) => ["-autoexit", "-nodisp", "-loglevel", "error", file],
        },
      ]
    : [
        { command: "aplay", makeArgs: (file) => [file] },
        { command: "paplay", makeArgs: (file) => [file] },
        {
          command: "ffplay",
          makeArgs: (file) => ["-autoexit", "-nodisp", "-loglevel", "error", file],
        },
        { command: "play", makeArgs: (file) => [file] },
      ];

let detectedPlayer: AudioPlayer | null | undefined;
const earconFiles: Partial<Record<EarconType, string>> = {};

function findAudioPlayer(): AudioPlayer | null {
  if (detectedPlayer !== undefined) return detectedPlayer;

  for (const candidate of PLAYER_CANDIDATES) {
    const probe = spawnSync("which", [candidate.command], {
      stdio: "ignore",
    });
    if (probe.status === 0) {
      detectedPlayer = candidate;
      console.log(`🔈 Audio player: ${candidate.command}`);
      return candidate;
    }
  }

  console.warn(
    "No audio player found (looked for afplay/aplay/paplay/ffplay/play). Spoken responses will be skipped."
  );
  detectedPlayer = null;
  return null;
}

async function generateSpeechFile(text: string): Promise<string | null> {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const speech = await openai.audio.speech.create({
    model: TTS_MODEL,
    voice: TTS_VOICE,
    input: trimmed,
    response_format: "wav",
    instructions: "Speak in a friendly, helpful tone and mention that you are an AI assistant when relevant.",
  });

  const buffer = Buffer.from(await speech.arrayBuffer());
  const filePath = path.join(tmpdir(), `jarvis-tts-${randomUUID()}.wav`);
  await fs.writeFile(filePath, buffer);
  return filePath;
}

async function playAudioFile(filePath: string, player: AudioPlayer) {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(player.command, player.makeArgs(filePath), {
      stdio: ["ignore", "ignore", "inherit"],
    });

    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (code === 0 || (code === null && signal === "SIGTERM")) {
        resolve();
      } else {
        reject(
          new Error(
            `Audio player exited with code ${code}${signal ? ` (signal ${signal})` : ""}`
          )
        );
      }
    });
  });
}

async function speak(text: string) {
  try {
    const player = findAudioPlayer();
    if (!player) return;

    const filePath = await generateSpeechFile(text);
    if (!filePath) return;

    try {
      console.log(`🔊 Speaking (voice: ${TTS_VOICE})`);
      await playAudioFile(filePath, player);
    } finally {
      await fs.unlink(filePath).catch(() => {});
    }
  } catch (err) {
    console.error("Failed to synthesize or play speech:", err);
  }
}

function createEarconBuffer(
  frequency: number,
  durationMs: number,
  sampleRate = 24000,
  volume = 0.25
): Buffer {
  const sampleCount = Math.max(1, Math.round((sampleRate * durationMs) / 1000));
  const dataSize = sampleCount * 2;
  const buffer = Buffer.alloc(44 + dataSize);

  // RIFF header
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16); // PCM
  buffer.writeUInt16LE(1, 20); // format
  buffer.writeUInt16LE(1, 22); // channels
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28); // byte rate
  buffer.writeUInt16LE(2, 32); // block align
  buffer.writeUInt16LE(16, 34); // bits per sample
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);

  const amplitude = Math.max(0, Math.min(1, volume)) * 0.8 * 0x7fff;
  const fadeSamples = Math.min(sampleCount / 4, Math.round((sampleRate * 10) / 1000));

  for (let i = 0; i < sampleCount; i++) {
    const t = i / sampleRate;
    let sample = Math.sin(2 * Math.PI * frequency * t);
    if (fadeSamples > 0) {
      const fadeIn = Math.min(1, i / fadeSamples);
      const fadeOut = Math.min(1, (sampleCount - i - 1) / fadeSamples);
      sample *= Math.min(fadeIn, fadeOut);
    }
    const value = Math.round(sample * amplitude);
    buffer.writeInt16LE(value, 44 + i * 2);
  }

  return buffer;
}

async function ensureEarconFile(type: EarconType): Promise<string | null> {
  if (earconFiles[type]) return earconFiles[type] || null;

  const config =
    type === "start"
      ? { freq: 1200, duration: 140 }
      : { freq: 600, duration: 140 };

  const filePath = path.join(
    tmpdir(),
    `jarvis-earcon-${type}-${process.pid}.wav`
  );

  try {
    const buffer = createEarconBuffer(config.freq, config.duration);
    await fs.writeFile(filePath, buffer);
    earconFiles[type] = filePath;
    return filePath;
  } catch (err) {
    console.warn(`Failed to prepare ${type} earcon:`, err);
    earconFiles[type] = undefined;
    return null;
  }
}

async function playEarcon(type: EarconType) {
  try {
    const player = findAudioPlayer();
    if (!player) return;
    const filePath = await ensureEarconFile(type);
    if (!filePath) return;
    await playAudioFile(filePath, player);
  } catch (err) {
    console.warn(`Failed to play ${type} earcon:`, err);
  }
}

function resolveAudioDeviceIndex(): number {
  const label = AUDIO_DEVICE?.trim();
  if (!label || label.toLowerCase() === "default") return -1;

  if (/^-?\d+$/.test(label)) {
    return Number.parseInt(label, 10);
  }

  try {
    const devices = PvRecorder.getAvailableDevices();
    const idx = devices.findIndex((name) =>
      name.toLowerCase().includes(label.toLowerCase())
    );
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
    console.warn(
      `Could not enumerate audio devices (${(err as Error).message}). Falling back to default.`
    );
  }

  return -1;
}

function toInt16LEPCM(buf: Buffer, frameBytes: number): Int16Array {
  const samples = frameBytes / 2;
  const out = new Int16Array(samples);
  for (let i = 0; i < samples; i++) out[i] = buf.readInt16LE(i * 2);
  return out;
}

async function startAAI(): Promise<string> {
  if (transcriber) {
    try {
      await transcriber.close(false);
    } catch (err) {
      console.warn("Previous transcriber cleanup failed:", err);
    } finally {
      transcriber = null;
    }
  }

  finalTranscript = null;
  transcriberReady = false;
  conversationBuffer = Buffer.alloc(0);
  const sessionTranscriber = AAI_CLIENT.streaming.transcriber({
    sampleRate: SAMPLE_RATE,
    formatTurns: true,
    encoding: "pcm_s16le",
    maxTurnSilence: 10000,
    minEndOfTurnSilenceWhenConfident: 2000,
  });
  transcriber = sessionTranscriber;

  return new Promise<string>((resolve, reject) => {
    let finished = false;
    let latestTranscript = "";
    let formattedTranscript = "";

    const finalize = async () => {
      if (finished) return;
      finished = true;
      transcriberReady = false;
      conversationBuffer = Buffer.alloc(0);
      try {
        await sessionTranscriber.close();
      } catch (err) {
        console.warn("Error while closing transcriber:", err);
      }
      if (transcriber === sessionTranscriber) {
        transcriber = null;
      }
    };

    sessionTranscriber.on("open", () => {
      if (transcriber === sessionTranscriber) {
        transcriberReady = true;
        console.log("🎧 AssemblyAI session ready—start speaking.");
        flushConversationAudio();
      }
    });

    sessionTranscriber.on("turn", (turn) => {
      if (typeof turn.transcript === "string" && turn.transcript.length) {
        if (turn.turn_is_formatted) {
          if (turn.transcript.length >= formattedTranscript.length) {
            formattedTranscript = turn.transcript;
          }
        } else if (turn.transcript.length >= latestTranscript.length) {
          latestTranscript = turn.transcript;
        }
        finalTranscript =
          formattedTranscript.length >= latestTranscript.length
            ? formattedTranscript
            : latestTranscript;
      }
      if (turn.end_of_turn && turn.turn_is_formatted) {
        flushConversationAudio(true);
        finalize()
          .then(() => resolve(finalTranscript || ""))
          .catch(reject);
      }
    });

    sessionTranscriber.on("error", (err) => {
      finalize().finally(() => reject(err));
    });

    sessionTranscriber.on("close", (code, reason) => {
      flushConversationAudio(true);
      finalize().finally(() => {
        if (finalTranscript !== null || latestTranscript) {
          const best =
            (finalTranscript && finalTranscript.length)
              ? finalTranscript
              : formattedTranscript.length >= latestTranscript.length
              ? formattedTranscript
              : latestTranscript;
          resolve((best || "").trim());
        } else {
          reject(new Error(`AAI closed without final transcript (${code} ${reason})`));
        }
      });
    });

    sessionTranscriber
      .connect()
      .catch((err) => {
        finalize().finally(() => reject(err));
      });
  });
}

function resetToIdle() {
  finalTranscript = null;
  idleBuf = Buffer.alloc(0);
  conversationBuffer = Buffer.alloc(0);
  transcriberReady = false;
  state = "IDLE";
  console.log('…back to IDLE (listening for "Jarvis")');
  if (transcriber) {
    const current = transcriber;
      transcriber = null;
    current
      .close(false)
      .catch((err) => console.warn("Failed to close transcriber during reset:", err));
  }
}

function sendFrameToTranscriber(frame: Buffer) {
  if (!transcriber) return;
  try {
    const payload = frame.buffer.slice(frame.byteOffset, frame.byteOffset + frame.byteLength);
    transcriber.sendAudio(payload);
  } catch (err) {
    console.error("Failed to stream audio frame:", err);
  }
}

function flushConversationAudio(force = false) {
  if (!transcriber) return;
  if (!transcriberReady && !force) return;

  while (conversationBuffer.length >= AAI_FRAME_BYTES) {
    const frame = conversationBuffer.subarray(0, AAI_FRAME_BYTES);
    conversationBuffer = conversationBuffer.subarray(AAI_FRAME_BYTES);
    sendFrameToTranscriber(frame);
  }

  if (force && conversationBuffer.length && transcriberReady) {
    sendFrameToTranscriber(conversationBuffer);
    conversationBuffer = Buffer.alloc(0);
  }

  if (force && !transcriberReady) {
    conversationBuffer = Buffer.alloc(0);
  }
}

async function captureUserUtterance(): Promise<string | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    conversationBuffer = Buffer.alloc(0);
    state = "LISTENING";
    await playEarcon("start");
    try {
      const result = await startAAI();
      const trimmed = result.trim();
      if (trimmed) {
        await playEarcon("stop");
        return trimmed;
      }

      await speak("I'm sorry, I didn't get that. Please try again.");
      await playEarcon("stop");
      if (attempt === 0) {
        console.log("No transcript captured; continuing to listen without the wake word.");
        continue;
      }

      console.log("No speech detected after retry; returning to IDLE.");
      return null;
    } catch (e) {
      console.error("AAI error:", e);
      await playEarcon("stop");
      return null;
    }
  }

  return null;
}

async function handleConversationLoop() {
  while (true) {
    const transcript = await captureUserUtterance();
    if (!transcript) {
      resetToIdle();
      return;
    }

    state = "THINKING";
    console.log(`\n🗣️  "${transcript}"`);
    const finalReply = await thinkAndAct(transcript); // <-- tool-driven loop
    const trimmedReply = finalReply.trim();
    if (!trimmedReply || !trimmedReply.endsWith("?")) {
      resetToIdle();
      return;
    }
  }
}

function processAudioChunk(chunk: Buffer) {
  try {
    if (state === "IDLE") {
      // Feed Porcupine frames
      idleBuf = Buffer.concat([idleBuf, chunk]);
      while (idleBuf.length >= PPN_FRAME_BYTES) {
        const frame = idleBuf.subarray(0, PPN_FRAME_BYTES);
        idleBuf = idleBuf.subarray(PPN_FRAME_BYTES);
        const pcm = toInt16LEPCM(frame, PPN_FRAME_BYTES);
        const idx = porcupine.process(pcm);
        if (idx >= 0) {
          console.log("🔔 Wake word detected: Jarvis");
          if (!activeConversation) {
            const convo = handleConversationLoop();
            activeConversation = convo;
            convo
              .catch((err) => {
                console.error("Conversation handling error:", err);
              })
              .finally(() => {
                activeConversation = null;
              });
          }
          break;
        }
      }
    } else if (state === "LISTENING") {
      conversationBuffer = Buffer.concat([conversationBuffer, chunk]);
      flushConversationAudio();
    }
  } catch (e) {
    console.error("Audio pipeline error:", e);
    resetToIdle();
  }
}

async function pumpAudio() {
  if (!recorder) return;
  try {
    while (recorder && recorder.isRecording) {
      const pcm = await recorder.read();
      if (!recorder || !recorder.isRecording) break;
      const chunk = Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength);
      processAudioChunk(chunk);
    }
  } catch (err) {
    if ((err as Error)?.message?.includes("PvRecorder failed to read")) {
      console.error("Recorder stopped unexpectedly:", err);
    } else {
      console.error("Audio capture error:", err);
    }
    resetToIdle();
  } finally {
    audioLoopPromise = null;
  }
}

function start() {
  console.log("Jarvis on Pi starting...");
  console.log('State: IDLE (say "Jarvis" to wake)');

  try {
    const deviceIndex = resolveAudioDeviceIndex();
    recorder = new PvRecorder(porcupine.frameLength, deviceIndex);
    recorder.start();
    console.log(`🎙️  Using microphone: ${recorder.getSelectedDevice()}`);
    if (recorder.sampleRate !== SAMPLE_RATE) {
      console.warn(
        `Recorder sample rate ${recorder.sampleRate}Hz differs from configured ${SAMPLE_RATE}Hz; audio may sound incorrect.`
      );
    }
    audioLoopPromise = pumpAudio();
    audioLoopPromise?.catch((err) => {
      console.error("Audio loop error:", err);
      resetToIdle();
    });
  } catch (err) {
    console.error("Failed to start audio recorder:", err);
    process.exit(1);
  }

  process.on("SIGINT", () => {
    console.log("\nExiting…");
    try {
      porcupine.release();
    } catch {}
    try {
      if (transcriber) {
        transcriber.close(false).catch((err) =>
          console.error("Failed to close transcriber:", err)
        );
      }
    } catch {}
    try {
      if (recorder) {
        recorder.stop();
        recorder.release();
      }
    } catch (err) {
      console.error("Failed to cleanly stop recorder:", err);
    } finally {
      recorder = null;
    }
    process.exit(0);
  });
}

start();
