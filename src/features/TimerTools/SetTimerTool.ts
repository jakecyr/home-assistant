import type { ITimerService } from "../../domain/timers/TimerService";
import type { ToolExecutionResult } from "../../ports/tools/ToolRegistryPort";
import type { TimePort } from "../../ports/sys/TimePort";

export interface SetTimerArgs {
  hours?: number;
  minutes?: number;
  seconds?: number;
  label?: string;
}

export class SetTimerTool {
  readonly name = "timer_set";
  readonly description =
    "Start a countdown timer using hours, minutes, and seconds. Plays an alarm when finished until the wake word is spoken.";

  readonly schema = {
    type: "object",
    properties: {
      hours: {
        type: "integer",
        minimum: 0,
        description: "Number of hours for the timer (optional).",
      },
      minutes: {
        type: "integer",
        minimum: 0,
        description: "Number of minutes for the timer (optional).",
      },
      seconds: {
        type: "integer",
        minimum: 0,
        description: "Number of seconds for the timer (optional).",
      },
      label: {
        type: "string",
        description: "Optional label to identify the timer.",
      },
    },
    required: [],
    additionalProperties: false,
  };

  constructor(
    private readonly timers: ITimerService,
    private readonly time: TimePort
  ) {}

  async exec(rawArgs: SetTimerArgs): Promise<ToolExecutionResult> {
    const { hours, minutes, seconds, label } = normalizeParts(rawArgs);

    if (hours === null && minutes === null && seconds === null) {
      return { ok: false, message: "Provide hours, minutes, or seconds to start a timer." };
    }

    const totalSeconds = (hours ?? 0) * 3600 + (minutes ?? 0) * 60 + (seconds ?? 0);

    if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) {
      return { ok: false, message: "Timer duration must be greater than zero." };
    }

    const durationMs = totalSeconds * 1000;
    if (!Number.isSafeInteger(durationMs)) {
      return { ok: false, message: "Timer duration is too large." };
    }

    const timer = this.timers.create(durationMs, { label: label ?? undefined });

    const messageParts = [
      `Timer set for ${formatDuration(totalSeconds)}`,
      label ? `labeled "${label}"` : null,
      `ending at ${this.time.toLocaleTimeString(timer.finishesAt)}`,
    ].filter(Boolean);

    return {
      ok: true,
      message: `${messageParts.join(", ")}.`,
      data: timer,
    };
  }
}

function normalizeParts(args: SetTimerArgs) {
  return {
    hours: coerce(args.hours),
    minutes: coerce(args.minutes),
    seconds: coerce(args.seconds),
    label: typeof args.label === "string" ? args.label.trim() || undefined : undefined,
  };
}

function coerce(value: unknown): number | null {
  if (value === undefined || value === null) return null;
  const num = Number(value);
  if (!Number.isFinite(num) || num < 0) return null;
  return Math.floor(num);
}

function formatDuration(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const parts: string[] = [];
  if (hours > 0) parts.push(`${hours} hour${hours === 1 ? "" : "s"}`);
  if (minutes > 0) parts.push(`${minutes} minute${minutes === 1 ? "" : "s"}`);
  if (seconds > 0 || parts.length === 0) {
    parts.push(`${seconds} second${seconds === 1 ? "" : "s"}`);
  }
  if (parts.length === 1) return parts[0];
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
  return `${parts[0]}, ${parts[1]}, and ${parts[2]}`;
}
