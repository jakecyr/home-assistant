import type { LoggerPort } from "../../ports/sys/LoggerPort";

function log(level: "debug" | "info" | "warn" | "error", message: string, meta?: Record<string, unknown>) {
  const payload = meta && Object.keys(meta).length ? `${message} ${JSON.stringify(meta)}` : message;
  switch (level) {
    case "debug":
      return console.debug(payload);
    case "info":
      return console.info(payload);
    case "warn":
      return console.warn(payload);
    case "error":
      return console.error(payload);
    default:
      return console.log(payload);
  }
}

export class ConsoleLogger implements LoggerPort {
  debug(message: string, meta?: Record<string, unknown>): void {
    log("debug", message, meta);
  }
  info(message: string, meta?: Record<string, unknown>): void {
    log("info", message, meta);
  }
  warn(message: string, meta?: Record<string, unknown>): void {
    log("warn", message, meta);
  }
  error(message: string, meta?: Record<string, unknown>): void {
    log("error", message, meta);
  }
}
