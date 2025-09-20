import { promises as fs } from "fs";
import { tmpdir } from "os";
import path from "path";
import { spawn, spawnSync } from "child_process";
import { randomUUID } from "crypto";
import { loadTools } from "./tools";
import type { ToolContext } from "./tools/_types";
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
  SERPAPI_KEY,
  DEBUG_MODE,
  CONFIG_PATH,
  LOG_FILE,
  OPENAI_VOICE_MODEL,
  OPENAI_VOICE_NAME,
} from "./env";
import { loadConfig } from "./config";
import {
  buildDeviceContextSummary,
  getAllDeviceNames,
  shouldContinueConversation,
} from "./deviceContext";
import { initializeLogging } from "./runtime/logging";
import { attemptDirectDeviceControl } from "./runtime/deviceControl";
import { TimerService } from "./runtime/timers";
import { AlarmController } from "./runtime/alarm";

const { config: appConfig, path: loadedConfigPath } = loadConfig(CONFIG_PATH);
if (loadedConfigPath) {
  console.log(`Loaded config from ${loadedConfigPath}`);
} else if (CONFIG_PATH) {
  console.warn(
    `Config file ${CONFIG_PATH} not found; proceeding with defaults.`
  );
}

const ENABLED_TOOLS = Array.from(
  new Set(
    Array.isArray(appConfig.tools)
      ? appConfig.tools
          .map((name) => (typeof name === "string" ? name.trim() : ""))
          .filter((name) => name.length > 0)
      : []
  )
);

const registryPromise = loadTools(ENABLED_TOOLS);

const loggingHandle = initializeLogging(LOG_FILE);
if (loggingHandle.logPath) {
  console.log(`Logging output to ${loggingHandle.logPath}`);
}

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

  const ctx: ToolContext = {
    log: (...a: any[]) => console.log("[tool]", ...a),
    config: appConfig,
    env: {
      serpApiKey: SERPAPI_KEY,
    },
  };

  const direct = await attemptDirectDeviceControl(
    transcript,
    appConfig,
    ENABLED_TOOLS,
    registry,
    ctx
  );
  if (direct) {
    const { message } = direct;
    console.log(`🤖 (direct) ${message}`);
    pushHistory("user", transcript);
    if (message.trim()) pushHistory("assistant", message.trim());
    await speak(message);
    return message;
  }

  const { finalText, turns, toolUsed, lastToolMessage } =
    await runAgentWithTools(transcript, registry, ctx, {
      maxTurns: 6,
      history: conversationHistory,
      extraSystemContext:
        buildDeviceContextSummary(appConfig, ENABLED_TOOLS) ?? undefined,
      debugTools: DEBUG_MODE,
    });
  let responseText = finalText;

  const deviceMentioned = transcript.match(
    /\b(light|lamp|plug|socket|switch)\b/i
  );
  if (!toolUsed && deviceMentioned) {
    const deviceToolsEnabled = ENABLED_TOOLS.filter(
      (name) => name === "tplink_toggle" || name === "wiz_toggle"
    );

    if (!deviceToolsEnabled.length) {
      responseText =
        "Smart-device tools are disabled. Add tool names to the config 'tools' array to enable light or plug control.";
    } else {
      const names = getAllDeviceNames(appConfig, ENABLED_TOOLS);
      if (names.length) {
        responseText = `I didn't find a configured device matching that request. Try one of: ${names.join(
          ", "
        )}.`;
      } else {
        responseText =
          "I don't have any smart devices configured yet. Update config.json with your TP-Link or WiZ devices.";
      }
    }

    console.warn(
      "No tool was executed for a device-related request. Last tool message:",
      lastToolMessage
    );
  }

  console.log(`🤖 (${turns} turn${turns === 1 ? "" : "s"}) ${responseText}`);
  pushHistory("user", transcript);
  if (responseText.trim()) pushHistory("assistant", responseText.trim());
  await speak(responseText);
  return responseText;
}

if (!PICOVOICE_ACCESS_KEY || !ASSEMBLYAI_API_KEY || !OPENAI_API_KEY) {
  console.error("Missing one or more API keys in .env");
  process.exit(1);
}

type State = "IDLE" | "LISTENING" | "THINKING" | "ACTING";
let state: State = "IDLE";

const SAMPLE_RATE = 16000; // 16 kHz mono PCM16
const AAI_CLIENT = new AssemblyAI({ apiKey: ASSEMBLYAI_API_KEY });

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
let listeningEarconActive = false;

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
          makeArgs: (file) => [
            "-autoexit",
            "-nodisp",
            "-loglevel",
            "error",
            file,
          ],
        },
      ]
    : [
        { command: "aplay", makeArgs: (file) => [file] },
        { command: "paplay", makeArgs: (file) => [file] },
        {
          command: "ffplay",
          makeArgs: (file) => [
            "-autoexit",
            "-nodisp",
            "-loglevel",
            "error",
            file,
          ],
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
    model: OPENAI_VOICE_MODEL,
    voice: OPENAI_VOICE_NAME,
    input: trimmed,
    response_format: "wav",
    instructions:
      "Speak in a friendly, helpful tone and mention that you are an AI assistant when relevant.",
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
            `Audio player exited with code ${code}${
              signal ? ` (signal ${signal})` : ""
            }`
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
      console.log(`🔊 Speaking (voice: ${OPENAI_VOICE_NAME})`);
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
  const fadeSamples = Math.min(
    sampleCount / 4,
    Math.round((sampleRate * 10) / 1000)
  );

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
      console.log(
        `🎛️  Audio device matched "${label}": [${idx}] ${devices[idx]}`
      );
      return idx;
    }
    console.warn(
      `Audio device "${label}" not found. Falling back to default. Available devices:\n${devices
        .map((name, i) => `  [${i}] ${name}`)
        .join("\n")}`
    );
  } catch (err) {
    console.warn(
      `Could not enumerate audio devices (${
        (err as Error).message
      }). Falling back to default.`
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
      listeningEarconActive = false;
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
        playEarcon("start")
          .then(() => {
            listeningEarconActive = true;
          })
          .catch(() => {
            listeningEarconActive = false;
          });
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
            finalTranscript && finalTranscript.length
              ? finalTranscript
              : formattedTranscript.length >= latestTranscript.length
              ? formattedTranscript
              : latestTranscript;
          resolve((best || "").trim());
        } else {
          reject(
            new Error(`AAI closed without final transcript (${code} ${reason})`)
          );
        }
      });
    });

    sessionTranscriber.connect().catch((err) => {
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
      .catch((err) =>
        console.warn("Failed to close transcriber during reset:", err)
      );
  }
}

function sendFrameToTranscriber(frame: Buffer) {
  if (!transcriber) return;
  try {
    const payload = frame.buffer.slice(
      frame.byteOffset,
      frame.byteOffset + frame.byteLength
    );
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
    try {
      const result = await startAAI();
      const trimmed = result.trim();
      if (trimmed) {
        if (listeningEarconActive) {
          await playEarcon("stop");
          listeningEarconActive = false;
        }
        return trimmed;
      }

      await speak("I'm sorry, I didn't get that. Please try again.");
      if (listeningEarconActive) {
        await playEarcon("stop");
        listeningEarconActive = false;
      }
      if (attempt === 0) {
        console.log(
          "No transcript captured; continuing to listen without the wake word."
        );
        continue;
      }

      console.log("No speech detected after retry; returning to IDLE.");
      return null;
    } catch (e) {
      console.error("AAI error:", e);
      if (listeningEarconActive) {
        await playEarcon("stop");
        listeningEarconActive = false;
      }
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
    if (!shouldContinueConversation(trimmedReply)) {
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
        transcriber
          .close(false)
          .catch((err) => console.error("Failed to close transcriber:", err));
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
    loggingHandle.shutdown();
    process.exit(0);
  });
}

process.on("exit", () => {
  loggingHandle.shutdown();
});

start();
