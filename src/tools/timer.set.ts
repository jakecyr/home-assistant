import type { Tool } from "./_types";

function toMillis(hours = 0, minutes = 0, seconds = 0): number {
  return hours * 3600_000 + minutes * 60_000 + seconds * 1000;
}

const timerTool: Tool = {
  name: "timer_set",
  description:
    "Start a countdown timer. Provide hours/minutes/seconds and an optional label. When the timer ends, the assistant plays an alarm.",
  parameters: {
    type: "object",
    properties: {
      hours: {
        type: "number",
        minimum: 0,
        description: "Number of hours for the timer.",
      },
      minutes: {
        type: "number",
        minimum: 0,
        description: "Number of minutes for the timer.",
      },
      seconds: {
        type: "number",
        minimum: 0,
        description: "Number of seconds for the timer.",
      },
      label: {
        type: "string",
        description: "Optional label for the timer (e.g., 'tea').",
      },
    },
    additionalProperties: false,
  },
  async execute(args, ctx) {
    if (!ctx.timers) {
      return {
        ok: false,
        message:
          "Timers are not enabled. Add 'timer_set' to the tools list in config to activate this feature.",
      };
    }

    const hours = Number(args.hours ?? 0);
    const minutes = Number(args.minutes ?? 0);
    const seconds = Number(args.seconds ?? 0);

    if ([hours, minutes, seconds].some((value) => value < 0)) {
      return { ok: false, message: "Timer values cannot be negative." };
    }

    const durationMs = toMillis(hours, minutes, seconds);
    if (durationMs <= 0) {
      return {
        ok: false,
        message: "Specify a duration (hours, minutes, or seconds) greater than zero.",
      };
    }

    const label = typeof args.label === "string" ? args.label.trim() : undefined;
    const timer = ctx.timers.scheduleTimer(durationMs, label);

    const parts: string[] = [];
    if (hours) parts.push(`${hours} hour${hours === 1 ? "" : "s"}`);
    if (minutes) parts.push(`${minutes} minute${minutes === 1 ? "" : "s"}`);
    if (seconds) parts.push(`${seconds} second${seconds === 1 ? "" : "s"}`);

    const durationText = parts.join(" ");
    const labelText = label ? ` for ${label}` : "";

    return {
      ok: true,
      message: `Timer${labelText} set for ${durationText}.`,
      data: { id: timer.id, fireAt: timer.fireAt },
    };
  },
};

export default timerTool;
