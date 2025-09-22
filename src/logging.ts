import { createWriteStream, existsSync, mkdirSync } from "fs";
import path from "path";

export interface LoggingHandle {
  readonly logPath?: string;
  shutdown(): void;
}

export function initializeLogging(logFile?: string): LoggingHandle {
  if (!logFile) {
    return {
      shutdown: () => undefined,
    };
  }

  const resolvedLog = path.resolve(logFile);
  const logDir = path.dirname(resolvedLog);
  if (!existsSync(logDir)) {
    mkdirSync(logDir, { recursive: true });
  }

  const stream = createWriteStream(resolvedLog, { flags: "a" });
  const startedAt = new Date().toISOString();
  stream.write(`[${startedAt}] --- Jarvis session started ---\n`);

  const original = {
    log: console.log.bind(console),
    info: console.info?.bind(console) ?? console.log.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
  };

  const mirror = (level: keyof typeof original) =>
    (...args: any[]) => {
      original[level](...args);
      try {
        const timestamp = new Date().toISOString();
        const message = args
          .map((arg) =>
            typeof arg === "string"
              ? arg
              : (() => {
                  try {
                    return JSON.stringify(arg);
                  } catch {
                    return String(arg);
                  }
                })()
          )
          .join(" ");
        stream.write(`[${timestamp}] ${level.toUpperCase()} ${message}\n`);
      } catch {
        // ignore logging failures
      }
    };

  console.log = mirror("log");
  console.info = mirror("info");
  console.warn = mirror("warn");
  console.error = mirror("error");

  const shutdown = () => {
    console.log = original.log;
    console.info = original.info;
    console.warn = original.warn;
    console.error = original.error;
    const endedAt = new Date().toISOString();
    stream.write(`[${endedAt}] --- Jarvis session ended ---\n`);
    stream.end();
  };

  return {
    logPath: resolvedLog,
    shutdown,
  };
}
