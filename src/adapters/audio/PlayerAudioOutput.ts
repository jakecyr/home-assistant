import { promises as fs } from "fs";
import { tmpdir } from "os";
import path from "path";
import { spawn, spawnSync } from "child_process";
import { once } from "events";
import type {
  AudioOutputPort,
  PlayOptions,
  PlayStreamOptions,
  ToneOptions,
} from "../../ports/audio/AudioOutputPort";

interface AudioPlayerCandidate {
  command: string;
  makeArgs: (file: string) => string[];
}

function candidates(): AudioPlayerCandidate[] {
  if (process.platform === "darwin") {
    return [
      { command: "afplay", makeArgs: (file) => [file] },
      {
        command: "ffplay",
        makeArgs: (file) => ["-autoexit", "-nodisp", "-loglevel", "error", file],
      },
    ];
  }

  return [
    { command: "aplay", makeArgs: (file) => [file] },
    { command: "paplay", makeArgs: (file) => [file] },
    {
      command: "ffplay",
      makeArgs: (file) => ["-autoexit", "-nodisp", "-loglevel", "error", file],
    },
    { command: "play", makeArgs: (file) => [file] },
  ];
}

export class PlayerAudioOutput implements AudioOutputPort {
  private detected: AudioPlayerCandidate | null | undefined;
  private toneCache = new Map<string, string>();

  async play(filePath: string, options: PlayOptions = {}): Promise<void> {
    const player = this.findPlayer();
    if (!player) return;

    const { signal } = options;
    await new Promise<void>((resolve, reject) => {
      const child = spawn(player.command, player.makeArgs(filePath), {
        stdio: ["ignore", "ignore", "inherit"],
      });

      let settled = false;

      const finish = (err?: Error) => {
        if (settled) return;
        settled = true;
        cleanup();
        if (err) reject(err);
        else resolve();
      };

      const onAbort = () => {
        if (child.exitCode === null && child.signalCode === null) {
          child.kill("SIGTERM");
        }
      };

      const cleanup = () => {
        if (signal) signal.removeEventListener("abort", onAbort);
      };

      if (signal) {
        if (signal.aborted) {
          onAbort();
        } else {
          signal.addEventListener("abort", onAbort);
        }
      }

      child.on("error", (err) => finish(err));
      child.on("exit", (code, signalName) => {
        if (code === 0 || (code === null && signalName === "SIGTERM")) {
          finish();
        } else {
          finish(
            new Error(
              `Audio player exited with code ${code}${
                signalName ? ` (signal ${signalName})` : ""
              }`
            )
          );
        }
      });
    });
  }

  async prepareTone(name: string, options: ToneOptions): Promise<string> {
    const cacheKey = `${name}:${options.frequency}:${options.ms}:${options.volume ?? ""}`;
    const cached = this.toneCache.get(cacheKey);
    if (cached) return cached;

    const filePath = path.join(tmpdir(), `assistant-tone-${cacheKey}.wav`);
    const buffer = createToneBuffer(options);
    await fs.writeFile(filePath, buffer);
    this.toneCache.set(cacheKey, filePath);
    return filePath;
  }

  async playStream(
    stream: AsyncIterable<Buffer>,
    options: PlayStreamOptions
  ): Promise<void> {
    const player = this.findPlayer();
    if (!player) return;
    if (!supportsStreaming(player.command)) {
      throw new Error(
        `Audio player ${player.command} does not support streamed playback.`
      );
    }

    const sampleRate = options.sampleRate;
    const args = makeStreamingArgs(player.command, sampleRate);
    const child = spawn(player.command, args, {
      stdio: ["pipe", "ignore", "inherit"],
    });

    const { signal } = options;

    const onAbort = () => {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill("SIGTERM");
      }
    };

    if (signal) {
      if (signal.aborted) {
        onAbort();
      } else {
        signal.addEventListener("abort", onAbort);
      }
    }

    try {
      for await (const chunk of stream) {
        if (signal?.aborted) break;
        if (!chunk?.length) continue;
        if (!child.stdin.write(chunk)) {
          await once(child.stdin, "drain");
        }
      }
    } finally {
      child.stdin.end();
    }

    await new Promise<void>((resolve, reject) => {
      child.on("error", reject);
      child.on("exit", (code, signalName) => {
        if (signal) signal.removeEventListener("abort", onAbort);
        if (code === 0 || (code === null && signalName === "SIGTERM")) {
          resolve();
        } else {
          reject(
            new Error(
              `Streaming audio player exited with code ${code}${
                signalName ? ` (signal ${signalName})` : ""
              }`
            )
          );
        }
      });
    });
  }

  private findPlayer(): AudioPlayerCandidate | null {
    if (this.detected !== undefined) return this.detected;

    for (const candidate of candidates()) {
      const probe = spawnSync("which", [candidate.command], { stdio: "ignore" });
      if (probe.status === 0) {
        this.detected = candidate;
        console.log(`🔈 Audio player: ${candidate.command}`);
        return candidate;
      }
    }

    console.warn(
      "No audio player found (checked afplay/aplay/paplay/ffplay/play). Audio output disabled."
    );
    this.detected = null;
    return null;
  }
}

function supportsStreaming(command: string): boolean {
  return command === "ffplay" || command === "aplay";
}

function makeStreamingArgs(command: string, sampleRate: number): string[] {
  if (command === "ffplay") {
    return [
      "-autoexit",
      "-nodisp",
      "-loglevel",
      "error",
      "-f",
      "s16le",
      "-ac",
      "1",
      "-ar",
      sampleRate.toString(),
      "pipe:0",
    ];
  }

  if (command === "aplay") {
    return [
      "-q",
      "-f",
      "S16_LE",
      "-c",
      "1",
      "-r",
      sampleRate.toString(),
      "-",
    ];
  }

  return [];
}

function createToneBuffer({
  frequency,
  ms,
  volume = 0.3,
}: ToneOptions): Buffer {
  const sampleRate = 24000;
  const sampleCount = Math.max(1, Math.round((sampleRate * ms) / 1000));
  const dataSize = sampleCount * 2;
  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
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
