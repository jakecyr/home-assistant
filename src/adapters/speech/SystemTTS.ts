import { randomUUID } from "crypto";
import { tmpdir } from "os";
import path from "path";
import { spawn, spawnSync } from "child_process";
import type { TTSPort } from "../../ports/speech/TTSPort";

export interface SystemTTSOptions {
  voice?: string;
}

export class SystemTTS implements TTSPort {
  constructor(private readonly options: SystemTTSOptions = {}) {
    if (!SystemTTS.isSupported()) {
      throw new Error("System TTS is not supported on this platform.");
    }
  }

  static isSupported(): boolean {
    return process.platform === "darwin" || process.platform === "linux";
  }

  async synthesize(text: string): Promise<string> {
    const trimmed = text.trim();
    if (!trimmed) {
      throw new Error("Cannot synthesize empty text.");
    }

    if (process.platform === "darwin") {
      const outputPath = path.join(tmpdir(), `system-tts-${randomUUID()}.aiff`);
      const args: string[] = ["-o", outputPath];

      const voice = this.options.voice?.trim();
      if (voice) {
        args.push("-v", voice);
      }

      args.push(trimmed);

      await runCommand("say", args);
      return outputPath;
    }

    // Linux / Raspberry Pi support
    const linuxEngine = pickLinuxTTSEngine();
    if (!linuxEngine) {
      throw new Error(
        "No Linux TTS engine found. Install one of: pico2wave (sudo apt install -y libttspico-utils), espeak-ng (sudo apt install -y espeak-ng), or flite (sudo apt install -y flite)."
      );
    }

    const outputPath = path.join(tmpdir(), `system-tts-${randomUUID()}.wav`);
    const voice = this.options.voice?.trim();
    const { command, buildArgs, useStdin } = linuxEngine;

    const args = buildArgs(outputPath, trimmed, voice);
    await runCommand(command, args, useStdin ? trimmed : undefined);
    return outputPath;
  }
}

function runCommand(command: string, args: string[], stdinText?: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: stdinText ? ["pipe", "ignore", "inherit"] : ["ignore", "ignore", "inherit"],
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Command "${command}" exited with code ${code}`));
      }
    });

    if (stdinText && child.stdin) {
      child.stdin.end(stdinText);
    }
  });
}

type LinuxEngine = {
  command: string;
  buildArgs: (outputPath: string, text: string, voice?: string) => string[];
  useStdin?: boolean;
};

function which(cmd: string): boolean {
  const res = spawnSync("which", [cmd], { stdio: "ignore" });
  return res.status === 0;
}

function pickLinuxTTSEngine(): LinuxEngine | null {
  // Prefer pico2wave on Raspberry Pi/Ubuntu (fast, light, outputs wav directly)
  if (which("pico2wave")) {
    return {
      command: "pico2wave",
      buildArgs: (out, text, voice) => {
        const args = ["-w", out];
        if (voice) {
          // pico2wave uses locales like en-US, en-GB, es-ES
          args.push("-l", voice);
        }
        args.push(text);
        return args;
      },
    };
  }

  // espeak-ng (or espeak) can render directly to wav
  if (which("espeak-ng")) {
    return {
      command: "espeak-ng",
      buildArgs: (out, text, voice) => {
        const args = ["-w", out];
        if (voice) args.push("-v", voice);
        args.push(text);
        return args;
      },
    };
  }
  if (which("espeak")) {
    return {
      command: "espeak",
      buildArgs: (out, text, voice) => {
        const args = ["-w", out];
        if (voice) args.push("-v", voice);
        args.push(text);
        return args;
      },
    };
  }

  // flite fallback
  if (which("flite")) {
    return {
      command: "flite",
      buildArgs: (out, text, voice) => {
        // flite syntax: flite [options] text output.wav
        const args: string[] = [];
        if (voice) args.push("-voice", voice);
        args.push(text, out);
        return args;
      },
    };
  }

  // text2wave (festival) can read from stdin and output wav
  if (which("text2wave")) {
    return {
      command: "text2wave",
      buildArgs: (out) => ["-o", out],
      useStdin: true,
    };
  }

  return null;
}
