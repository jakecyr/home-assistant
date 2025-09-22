import type { ToolExecutionResult } from "../../ports/tools/ToolRegistryPort";
import type { TimePort } from "../../ports/sys/TimePort";

export interface TimeNowArgs {
  timezone?: string;
  locale?: string;
}

export class TimeNowTool {
  readonly name = "time_now";
  readonly description =
    "Get the current date and time. Optionally specify a timezone (IANA identifier).";

  readonly schema = {
    type: "object",
    properties: {
      timezone: {
        type: "string",
        description: "IANA timezone identifier, e.g., America/Los_Angeles.",
      },
      locale: {
        type: "string",
        description: "Locale for formatting (optional).",
      },
    },
    required: [],
    additionalProperties: false,
  };

  constructor(private readonly time: TimePort) {}

  async exec(args: TimeNowArgs): Promise<ToolExecutionResult> {
    const timezone = typeof args.timezone === "string" ? args.timezone : undefined;
    const locale = typeof args.locale === "string" ? args.locale : undefined;

    const now = new Date(this.time.now());

    const options: Intl.DateTimeFormatOptions = {
      dateStyle: "full",
      timeStyle: "medium",
      ...(timezone ? { timeZone: timezone } : {}),
    };

    let formatted: string;
    try {
      formatted = new Intl.DateTimeFormat(locale || undefined, options).format(now);
    } catch (err: any) {
      return {
        ok: false,
        message: `Failed to format time: ${err?.message || err}`,
      };
    }

    return {
      ok: true,
      message: `It is currently ${formatted}${timezone ? ` (${timezone})` : ""}.`,
      data: {
        iso: now.toISOString(),
        timezone,
        locale,
      },
    };
  }
}
