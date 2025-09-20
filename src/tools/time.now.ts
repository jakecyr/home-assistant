import type { Tool } from "./_types";

const timeTool: Tool = {
  name: "time_now",
  description:
    "Get the current date and time. Optionally specify a timezone (IANA identifier).",
  parameters: {
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
  },
  async execute(args) {
    const timezone = typeof args.timezone === "string" ? args.timezone : undefined;
    const locale = typeof args.locale === "string" ? args.locale : undefined;

    const options: Intl.DateTimeFormatOptions = {
      dateStyle: "full",
      timeStyle: "medium",
      ...(timezone ? { timeZone: timezone } : {}),
    };

    let formatted: string;
    try {
      formatted = new Intl.DateTimeFormat(locale || undefined, options).format(
        new Date()
      );
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
        iso: new Date().toISOString(),
        timezone,
        locale,
      },
    };
  },
};

export default timeTool;
